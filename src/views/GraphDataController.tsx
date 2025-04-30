import { useSigma } from "@react-sigma/core";
import { FC, PropsWithChildren, useEffect, useRef } from "react";

import { FiltersState } from "../types";

const GraphDataController: FC<PropsWithChildren<{ filters: FiltersState }>> = ({ filters, children }) => {
  const sigma = useSigma();
  const graph = sigma.getGraph();
  const draggedNode = useRef<string | null>(null);
  const isDragging = useRef(false);

  /**
   * Check if a node passes the cluster filter
   */
  const nodePassesClusterFilter = (nodeId: string): boolean => {
    // Get the list of clusters this node belongs to
    const nodeClustersList = graph.getNodeAttribute(nodeId, "clustersList") || [];
    const singleCluster = graph.getNodeAttribute(nodeId, "cluster");
    
    // Handle both array and single cluster for backward compatibility
    const clustersToCheck = nodeClustersList.length > 0 ? nodeClustersList : [singleCluster];
    
    // Node passes if ANY of its clusters are in the active filters
    return clustersToCheck.some(cluster => filters.clusters[cluster]);
  };

  /**
   * Apply filters to graphology:
   */
  useEffect(() => {
    const { tags } = filters;
    console.log("Filters applied:", filters);
    let visibleCount = 0;
    const tagsFilterKeys = Object.keys(tags);
    
    graph.forEachNode((node) => {
      // Check cluster filter
      const clusterCheck = nodePassesClusterFilter(node);
      
      // Check tag filter - support both single tag and list of tags
      let tagCheck = false;
      
      // Only check tags if we have active tag filters
      if (tagsFilterKeys.length > 0) {
        // Support for array of tags
        const nodeTags = graph.getNodeAttribute(node, "tags");
        const singleTag = graph.getNodeAttribute(node, "tag");
        
        if (Array.isArray(nodeTags) && nodeTags.length > 0) {
          // If the node has a tags array, check if any of those tags are in the filter
          tagCheck = nodeTags.some(tag => tags[tag]);
        } else if (Array.isArray(singleTag)) {
          // Alternative format: tag as array
          tagCheck = singleTag.some(tag => tags[tag]);
        } else if (singleTag) {
          // Backward compatibility: tag as string
          tagCheck = !!tags[singleTag];
        }
      } else {
        // If no tag filters are selected (empty filter), hide all nodes
        tagCheck = false;
      }
      
      // A node is visible if it passes both cluster and tag filters
      const isVisible = clusterCheck && tagCheck;
      
      if (isVisible) visibleCount++;
      
      // For debugging specific node issues
      if (node === 'some-problematic-node') {
        console.log("Node:", node, "Tags:", graph.getNodeAttribute(node, "tags"), 
          "Tag:", graph.getNodeAttribute(node, "tag"), 
          "ClusterCheck:", clusterCheck, "TagCheck:", tagCheck);
      }
      
      graph.setNodeAttribute(node, "hidden", !isVisible);
    });
    
    console.log(`Nodes visible: ${visibleCount}/${graph.order}`);
  }, [graph, filters]);

  /**
   * Add node dragging functionality
   */
  useEffect(() => {
    // Mouse position in sigma coordinates
    let lastX: number = 0;
    let lastY: number = 0;
    
    // When mouse is down on a node, start dragging
    const onMouseDown = (e: MouseEvent) => {
      //const camera = sigma.getCamera();
      const graphCoords = sigma.viewportToGraph({ x: e.offsetX, y: e.offsetY });
      let nodeAtMouse: string | null = null;
      graph.forEachNode((node, attributes) => {
        const dx = attributes.x - graphCoords.x;
        const dy = attributes.y - graphCoords.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 10) { // Adjust threshold as needed
          nodeAtMouse = node;
        }
      });
      
      if (nodeAtMouse) {
        isDragging.current = true;
        draggedNode.current = nodeAtMouse;
        lastX = e.offsetX;
        lastY = e.offsetY;
        
        // Disable camera controls while dragging
        sigma.getCamera().disable();
      }
    };
    
    // When mouse moves, update node position if dragging
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !draggedNode.current) return;
      
      // Get mouse position in sigma coordinates
      const currentX = e.offsetX;
      const currentY = e.offsetY;
      
      // Calculate the new position in the graph space
      //const camera = sigma.getCamera();
      const oldPos = sigma.viewportToGraph({ x: lastX, y: lastY });
      const newPos = sigma.viewportToGraph({ x: currentX, y: currentY });
      
      // Update node position by the difference
      const node = draggedNode.current;
      const nodeX = graph.getNodeAttribute(node, "x");
      const nodeY = graph.getNodeAttribute(node, "y");
      
      graph.setNodeAttribute(node, "x", nodeX + (newPos.x - oldPos.x));
      graph.setNodeAttribute(node, "y", nodeY + (newPos.y - oldPos.y));
      
      // Update last mouse position
      lastX = currentX;
      lastY = currentY;
    };
    
    // When mouse is up, stop dragging
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        draggedNode.current = null;
        
        // Re-enable camera controls
        sigma.getCamera().enable();
      }
    };
    
    // Get the canvas container element
    const container = sigma.getContainer();
    
    // Add event listeners
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp); // Use window to catch mouseup outside canvas
    
    // Cleanup function
    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [sigma, graph]);

  return <>{children}</>;
};

export default GraphDataController;
