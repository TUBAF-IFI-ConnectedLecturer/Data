<script lang="ts">
import { Splitpanes, Pane } from "splitpanes";
import "splitpanes/dist/splitpanes.css";
import * as THREE from "three";
import { sparqlEngine } from "../utils/sparqlEngine";

import { VRButton } from "../../node_modules/three/examples/jsm/webxr/VRButton.js";
//import ForceGraph3D from "3d-force-graph";
import {
  includes,
  resetNodePositions,
  stringToColor,
  getOrientation,
  updateUrlParams,
  parseUrlParams,
  encodeSparqlForUrl,
  decodeSparqlFromUrl,
} from "../utils";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "../../node_modules/three/examples/jsm/renderers/CSS2DRenderer.js";

var Graph: any = null;

type Node = {
  id: string;
  title: string;
  type: string;
  file: string;
  affiliation: string;
  summary: string;
  authors: string;
  tag: string[];
};

type Link = {
  source: string | Node;
  target: string | Node;
};

var database: { nodes: Node[]; links: Link[] } = {
  nodes: [],
  links: [],
};

export default {
  name: "App",

  components: { Splitpanes, Pane },

  data() {
    return {
      version: 0,
      activeId: null as string | null,
      search: {
        text: "",
        loading: false,
      },

      open: {
        description: false,
      },

      split: "both",

      orientation: getOrientation(),

      settings: {
        title: false,
      },

      article: {
        show: false,
        content: null,
      },

      // SPARQL filtering state
      sparqlFilters: {
        active: false,
        data: [] as Node[],
        originalData: null as { nodes: Node[]; links: Link[] } | null,
        currentQuery: "",
        loading: false,
        error: null as string | null,
        abortController: null as AbortController | null,
      },

      // SPARQL interface state
      showSparqlInterface: true,
      selectedPresetQuery: null as string | null,
      customSparqlQuery: "",

      // Search mode: 'normal' or 'sparql'
      searchMode: "normal" as "normal" | "sparql",

      // Separate active ID for SPARQL mode to avoid conflicts
      activeSparqlId: null as string | null,

      // SPARQL menu options
      sparqlQueries: [
        {
          name: "All Learning Resources",
          key: "all",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?format ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title .
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
  OPTIONAL { ?resource dcterms:format ?format }
  OPTIONAL { ?resource dcterms:subject ?subject }
} LIMIT 10`,
        },
        {
          name: "Resources with Similarity Links",
          key: "similar",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX sim: <http://example.org/similarity/>

SELECT ?resource ?title ?creator ?similar ?similarTitle WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            sim:similarTo ?similar .
  ?similar dcterms:title ?similarTitle .
  OPTIONAL { ?resource dcterms:creator ?creator }
} LIMIT 10`,
        },
        {
          name: "Database & SQL Resources",
          key: "databases",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "datenbank") || 
         CONTAINS(LCASE(STR(?subject)), "sql") ||
         CONTAINS(LCASE(STR(?title)), "datenbank") ||
         CONTAINS(LCASE(STR(?title)), "sql"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "Programming & Computer Science",
          key: "programming",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "informatik") || 
         CONTAINS(LCASE(STR(?subject)), "programming") ||
         CONTAINS(LCASE(STR(?subject)), "programmierung") ||
         CONTAINS(LCASE(STR(?subject)), "algorithmen") ||
         CONTAINS(LCASE(STR(?subject)), "python") ||
         CONTAINS(LCASE(STR(?subject)), "java"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "Mathematics Resources",
          key: "mathematics",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "mathematik") || 
         CONTAINS(LCASE(STR(?subject)), "mathe") ||
         CONTAINS(LCASE(STR(?title)), "mathematik") ||
         CONTAINS(LCASE(STR(?subject)), "algebra") ||
         CONTAINS(LCASE(STR(?subject)), "funktionen"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "PDF Documents",
          key: "pdf",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX sim: <http://example.org/similarity/>

SELECT ?resource ?title ?creator ?type ?format ?similarCount WHERE {
  # Get PDF documents first (smaller result set)
  {
    SELECT DISTINCT ?resource WHERE {
      ?resource a edu:LearningResource ;
                dcterms:format ?format .
      FILTER(?format = "pdf" || ?format = "application/pdf")
    }
    LIMIT 20  # Pre-limit to make similarity counting faster
  }
  
  # Get metadata for these PDFs
  ?resource dcterms:title ?title ;
            dcterms:format ?format .
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
  
  # Count similarities efficiently with COALESCE for zero handling
  OPTIONAL {
    SELECT ?resource (COUNT(DISTINCT ?related) as ?count) WHERE {
      {
        ?rel a sim:SimilarityRelation ;
             sim:source ?resource ;
             sim:target ?related .
      }
      UNION
      {
        ?rel a sim:SimilarityRelation ;
             sim:source ?related ;
             sim:target ?resource .
      }
    }
    GROUP BY ?resource
  }
  
  BIND(COALESCE(?count, 0) as ?similarCount)
}
ORDER BY DESC(?similarCount) ?title
LIMIT 10`,
        },
        {
          name: "Physics & Engineering",
          key: "physics",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "physik") || 
         CONTAINS(LCASE(STR(?subject)), "ingenieur") ||
         CONTAINS(LCASE(STR(?subject)), "technik") ||
         CONTAINS(LCASE(STR(?subject)), "elektrotechnik") ||
         CONTAINS(LCASE(STR(?title)), "physik"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "Office Documents (Word, PowerPoint, Excel)",
          key: "office",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?format WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:format ?format .
  FILTER(?format = "docx" || ?format = "pptx" || ?format = "xlsx" ||
         ?format = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
         ?format = "application/vnd.openxmlformats-officedocument.presentationml.presentation")
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "Resources by Specific Publishers",
          key: "publishers",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?publisher ?type WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:publisher ?publisher .
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "TU Dresden Resources",
          key: "tu_dresden",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?publisher ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:publisher ?publisher .
  FILTER(CONTAINS(LCASE(STR(?publisher)), "dresden") || 
         CONTAINS(LCASE(STR(?publisher)), "tu_dresden"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:subject ?subject }
} LIMIT 10`,
        },
        {
          name: "Chemistry & Biology",
          key: "chemistry",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "chemie") || 
         CONTAINS(LCASE(STR(?subject)), "biologie") ||
         CONTAINS(LCASE(STR(?subject)), "biochemie") ||
         CONTAINS(LCASE(STR(?title)), "chemie") ||
         CONTAINS(LCASE(STR(?subject)), "photosynthese"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
} LIMIT 10`,
        },
        {
          name: "Lecture Materials & Tutorials",
          key: "lectures",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:type ?type .
  FILTER(CONTAINS(LCASE(STR(?type)), "vorlesungsfolien") ||
         CONTAINS(LCASE(STR(?type)), "tutorial") ||
         CONTAINS(LCASE(STR(?type)), "skript"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:subject ?subject }
} LIMIT 10`,
        },
        {
          name: "Find Resources Similar to a Given One",
          key: "similarity_network",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX sim: <http://example.org/similarity/>

SELECT ?resource ?title ?similar1 ?title1 ?score1 WHERE {
  # Simplified: Only show direct similarities, not two-hop
  ?relation1 a sim:SimilarityRelation ;
             sim:source ?resource ;
             sim:target ?similar1 ;
             sim:score ?score1 .
  ?resource a edu:LearningResource ;
            dcterms:title ?title .
  ?similar1 dcterms:title ?title1 .
  
  # Filter for high-quality similarities only
  FILTER(?score1 > 0.7)
} 
ORDER BY DESC(?score1)
LIMIT 10`,
        },
        {
          name: "Resources with Rich Descriptions",
          key: "described",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?description (GROUP_CONCAT(DISTINCT ?subject; separator=", ") as ?subjects) WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:description ?description .
  FILTER(STRLEN(?description) > 100)
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:subject ?subject }
}
GROUP BY ?resource ?title ?creator ?description
LIMIT 10`,
        },
        {
          name: "Machine Learning & AI Resources",
          key: "ai_ml",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "künstliche_intelligenz") || 
         CONTAINS(LCASE(STR(?subject)), "machine_learning") ||
         CONTAINS(LCASE(STR(?subject)), "neuronale_netze") ||
         CONTAINS(LCASE(STR(?subject)), "ki-") ||
         CONTAINS(LCASE(STR(?title)), "intelligenz"))
  OPTIONAL { ?resource dcterms:creator ?creator }
  OPTIONAL { ?resource dcterms:type ?type }
}`,
        },
        {
          name: "Find Similar Resources to Specific ID",
          key: "similar_to_id",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX sim: <http://example.org/similarity/>
PREFIX oer: <http://example.org/oer/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?resource ?title ?creator ?type ?subject ?score WHERE {
  {
    # Find resources where the given ID is the source
    ?relation a sim:SimilarityRelation ;
              sim:source oer:YOUR_ID_HERE ;
              sim:target ?resource ;
              sim:score ?score .
    ?resource dcterms:title ?title .
    OPTIONAL { ?resource dcterms:creator ?creator }
    OPTIONAL { ?resource dcterms:type ?type }
    OPTIONAL { ?resource dcterms:subject ?subject }
  }
  UNION
  {
    # Find resources where the given ID is the target
    ?relation a sim:SimilarityRelation ;
              sim:source ?resource ;
              sim:target oer:YOUR_ID_HERE ;
              sim:score ?score .
    ?resource dcterms:title ?title .
    OPTIONAL { ?resource dcterms:creator ?creator }
    OPTIONAL { ?resource dcterms:type ?type }
    OPTIONAL { ?resource dcterms:subject ?subject }
  }
  UNION
  {
    # Include the original resource itself
    BIND(oer:YOUR_ID_HERE as ?resource)
    BIND("1.0"^^xsd:decimal as ?score)
    ?resource dcterms:title ?title .
    OPTIONAL { ?resource dcterms:creator ?creator }
    OPTIONAL { ?resource dcterms:type ?type }
    OPTIONAL { ?resource dcterms:subject ?subject }
  }
}
ORDER BY DESC(?score)
LIMIT 10`,
        },
        {
          name: "Two-Hop Similarity Network from ID",
          key: "two_hop_similarity",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX sim: <http://example.org/similarity/>
PREFIX oer: <http://example.org/oer/>

SELECT DISTINCT ?resource ?title ?creator ?distance ?score WHERE {
  # Optimized: Start with direct similarities first (faster)
  {
    # Direct similarity (distance 1) - both directions
    {
      ?relation a sim:SimilarityRelation ;
                sim:source oer:YOUR_ID_HERE ;
                sim:target ?resource ;
                sim:score ?score .
    }
    UNION
    {
      ?relation a sim:SimilarityRelation ;
                sim:source ?resource ;
                sim:target oer:YOUR_ID_HERE ;
                sim:score ?score .
    }
    ?resource dcterms:title ?title .
    BIND("1" as ?distance)
  }
  UNION
  {
    # Two-hop: Only high-score intermediate connections (optimized)
    ?relation1 a sim:SimilarityRelation ;
               sim:source oer:YOUR_ID_HERE ;
               sim:target ?intermediate ;
               sim:score ?score1 .
    FILTER(?score1 > 0.8)  # Pre-filter for quality
    
    ?relation2 a sim:SimilarityRelation ;
               sim:source ?intermediate ;
               sim:target ?resource ;
               sim:score ?score .
    FILTER(?score > 0.7)   # Pre-filter for quality
    
    ?resource dcterms:title ?title .
    FILTER(?resource != oer:YOUR_ID_HERE)
    BIND("2" as ?distance)
  }
  
  OPTIONAL { ?resource dcterms:creator ?creator }
} 
ORDER BY ?distance DESC(?score) 
LIMIT 50`,
        },
        {
          name: "Similarity by Subject Overlap",
          key: "subject_similarity",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX oer: <http://example.org/oer/>

SELECT ?resource ?title ?creator (COUNT(?sharedSubject) as ?subjectOverlap) WHERE {
  # Optimized: Direct count without nested GROUP_CONCAT
  oer:YOUR_ID_HERE dcterms:subject ?sharedSubject .
  ?resource dcterms:subject ?sharedSubject ;
            dcterms:title ?title .
  FILTER(?resource != oer:YOUR_ID_HERE)
  OPTIONAL { ?resource dcterms:creator ?creator }
}
GROUP BY ?resource ?title ?creator
HAVING(COUNT(?sharedSubject) >= 2)  # Reduced threshold for faster results
ORDER BY DESC(?subjectOverlap) 
LIMIT 30`,
        },
        {
          name: "Resources with Most Similar Connections",
          key: "similarity_count",
          query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>
PREFIX sim: <http://example.org/similarity/>

SELECT ?resource ?title ?creator ?similarCount WHERE {
  # Pre-filter to learning resources first
  {
    SELECT ?resource (COUNT(DISTINCT ?related) as ?similarCount) WHERE {
      ?resource a edu:LearningResource .
      
      # Count similarities efficiently with early limiting
      {
        SELECT DISTINCT ?resource ?related WHERE {
          {
            ?relation a sim:SimilarityRelation ;
                      sim:source ?resource ;
                      sim:target ?related .
          }
          UNION
          {
            ?relation a sim:SimilarityRelation ;
                      sim:source ?related ;
                      sim:target ?resource .
          }
        }
        LIMIT 1000  # Pre-limit similarity relations to check
      }
    }
    GROUP BY ?resource
    ORDER BY DESC(?similarCount)
    LIMIT 20  # Pre-select top candidates
  }
  
  # Get metadata for selected resources
  ?resource dcterms:title ?title .
  OPTIONAL { ?resource dcterms:creator ?creator }
}
ORDER BY DESC(?similarCount)
LIMIT 10`,
        },
      ],

      resizeObserver: new ResizeObserver(() => {
        this.handleResize();
      }),
    };
  },
  methods: {
    // Define any methods here if needed
    async handleSearch() {
      this.search.loading = true;
      this.article.show = false;
      Graph.pauseAnimation(); // make sure the loop is idle

      if (!database || !Graph) return;

      const rawTerm = this.search.text.trim(); // keep user casing*

      // Update URL parameters for search
      updateUrlParams({
        mode: "normal",
        search: rawTerm || null,
        id: null, // Clear ID when performing new search
      });

      const term = rawTerm.toLowerCase();

      // 1️⃣  Show the entire graph **only** when the search term is exactly '*'
      if (term === "*") {
        Graph.graphData(database).d3ReheatSimulation();
        this.updateCounters(database);
        Graph.resumeAnimation();
        this.search.loading = false;
        return;
      }

      // 2️⃣  Hide the graph completely when the search field is empty
      if (!term) {
        Graph.graphData({ nodes: [], links: [] });
        this.updateCounters({ nodes: [], links: [] });
        Graph.resumeAnimation();
        this.search.loading = false;
        return;
      }

      // 3️⃣  Otherwise, run the regular filtered search
      const nodeIds = new Set(
        database.nodes
          .filter((n) =>
            includes(
              `${n.title} ${n.affiliation || ""} ${n.summary || ""} ${n.authors || ""} ${
                n.file
              } ${n.tag.join(" ")}`,
              term
            )
          )
          .map((n) => n.id)
      );

      const links = [];
      for (const { source, target } of database.links) {
        // normalise to plain ids just once
        const sId = typeof source === "object" ? source.id : source;
        const tId = typeof target === "object" ? target.id : target;

        // keep the link only if either endpoint matches
        if (nodeIds.has(sId) && nodeIds.has(tId)) {
          links.push({ source: sId, target: tId });
        }
      }

      const nodes = resetNodePositions(database.nodes.filter((n) => nodeIds.has(n.id)));

      Graph.graphData({ nodes, links })
        .cooldownTicks(100)
        .d3ReheatSimulation()
        .zoomToFit(600, 40);
      Graph.resumeAnimation();

      this.updateCounters({ nodes, links });
      this.search.loading = false;
    },

    initGraph() {
      if (Graph) return;

      fetch("db.json")
        .then((response) => response.json())
        .then((json) => {
          const self = this;
          database = json;

          this.updateCounters({ nodes: [], links: [] });

          Graph = new ForceGraph3D(this.$refs.graph, {
            extraRenderers: [new CSS2DRenderer()],
            controlType: "orbit",
          })
            .graphData({ nodes: [], links: [] })
            .nodeColor((node) => {
              const baseColor = stringToColor(node.tag[0]);
              // Make the active node glow with a brighter, more saturated color
              if (node.id === this.activeId) {
                // Convert hex to RGB and increase brightness/saturation
                const hex = baseColor.replace("#", "");
                const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + 80);
                const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + 80);
                const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + 80);
                return `rgb(${r}, ${g}, ${b})`;
              }
              return baseColor;
            })
            .nodeVal((n) => n.value || 4)
            .onNodeRightClick((node) => {
              this.loadConnections(node);
            })
            .nodeThreeObject((node) => {
              // Create glowing effect for active node
              if (node.id === this.activeId && !this.settings.title) {
                const geometry = new THREE.SphereGeometry(10);
                const baseColor = stringToColor(node.tag[0]);

                // Create a glowing material
                const material = new THREE.MeshBasicMaterial({
                  color: baseColor,
                  transparent: true,
                  opacity: 0.8,
                });

                const sphere = new THREE.Mesh(geometry, material);

                // Add a larger, more transparent outer glow
                const glowGeometry = new THREE.SphereGeometry(20);
                const glowMaterial = new THREE.MeshBasicMaterial({
                  color: baseColor,
                  transparent: true,
                  opacity: 0.3,
                  side: THREE.BackSide,
                });
                const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);

                const group = new THREE.Group();
                group.add(sphere);
                group.add(glowSphere);

                return group;
              }

              if (this.settings.title) {
                const nodeEl = document.createElement("span");
                nodeEl.textContent =
                  node.title.length <= 25 ? node.title : node.title.slice(0, 25) + "...";
                nodeEl.style.color = stringToColor(node.tag[0]);
                nodeEl.className = "node-label";

                // Add glowing effect to label for active node
                if (node.id === this.activeId) {
                  nodeEl.style.textShadow = `0 0 10px ${stringToColor(
                    node.tag[0]
                  )}, 0 0 20px ${stringToColor(node.tag[0])}, 0 0 30px ${stringToColor(
                    node.tag[0]
                  )}`;
                  nodeEl.style.fontWeight = "bold";
                }

                return new CSS2DObject(nodeEl);
              }
            })
            .nodeThreeObjectExtend(true)
            .onNodeClick((node) => this.showArticle(node, true))
            .nodeLabel((node) => `${node.title}`);

          // Enable WebXR
          const renderer = Graph.renderer();
          renderer.xr.enabled = true;

          if ((navigator as any).xr && (navigator as any).xr.isSessionSupported) {
            (navigator as any).xr
              .isSessionSupported("immersive-vr")
              .then((supported: boolean) => {
                if (supported) {
                  this.$refs.graph.appendChild(VRButton.createButton(renderer));
                }
              });
          }

          Graph.pauseAnimation();
          //Graph.d3Force("charge").strength(-500);

          // Parse URL parameters to determine initial state
          const urlParams = parseUrlParams();

          // Set initial mode from URL or default to normal
          this.searchMode = urlParams.mode || "normal";

          // Handle initial view parameter
          if (urlParams.view) {
            this.split = urlParams.view;
          }

          setTimeout(function () {
            // Handle title parameter
            if (urlParams.title) {
              self.toggleTitle();
            }

            // Handle mode-specific initialization
            if (urlParams.mode === "sparql") {
              // SPARQL mode initialization
              if (urlParams.sparqlQuery) {
                self.customSparqlQuery = urlParams.sparqlQuery;
              }

              if (urlParams.sparqlPreset) {
                self.selectedPresetQuery = urlParams.sparqlPreset;
                // Load the preset query if available
                const presetQuery = self.sparqlQueries.find(
                  (q) => q.key === urlParams.sparqlPreset
                );
                if (presetQuery && !urlParams.sparqlQuery) {
                  self.customSparqlQuery = presetQuery.query;
                }
              }

              // Execute the SPARQL query if present
              if (self.customSparqlQuery) {
                self.executeCustomSparqlQuery().then(() => {
                  // Handle ID selection after SPARQL results are loaded
                  if (urlParams.id) {
                    setTimeout(() => {
                      // Find node in SPARQL results
                      const sparqlItem = self.sparqlFilters.data.find((item: any) => {
                        const originalId =
                          item.resource?.value?.split("/").pop() || item.id;
                        return originalId === urlParams.id;
                      });

                      if (sparqlItem) {
                        const visibleItem = self.visibleNodes.find(
                          (item: any) => item.originalId === urlParams.id
                        );
                        if (visibleItem) {
                          self.showArticle(visibleItem, true);
                        }
                      }
                    }, 1000);
                  }
                });
              }
            } else {
              // Normal mode initialization
              if (urlParams.search) {
                self.search.text = urlParams.search; // pre‑fill the field
                self.handleSearch(); // execute the search

                if (urlParams.id) {
                  setTimeout(function () {
                    const node = Graph.graphData().nodes.find(
                      (n: any) => n.id === urlParams.id
                    );
                    if (node) {
                      self.showArticle(node, true);
                    }
                  }, 1000);
                }
              } else if (urlParams.id) {
                // If only ID is provided, we need to find and highlight the node
                // This might require loading connections or showing the full graph
                setTimeout(function () {
                  // Show full graph first to find the node
                  Graph.graphData(database).d3ReheatSimulation();
                  self.updateCounters(database);

                  const node = database.nodes.find((n: Node) => n.id === urlParams.id);
                  if (node) {
                    self.showArticle(node, true);
                  }
                }, 1000);
              }
            }
          }, 1000);

          //this.$refs.graph.appendChild(VRButton.createButton(renderer));
        })
        .catch((err) => console.warn(err));

      this.resizeObserver.observe(this.$refs.graph);
    },

    updateCounters(graph: { nodes: Node[]; links: Link[] }) {
      this.version++;

      this.$refs.nodes.innerText = graph.nodes.length;
      this.$refs.links.innerText = graph.links.length;
    },

    handleResize() {
      if (!Graph) return;
      Graph.width(this.$refs.graph.clientWidth).height(this.$refs.graph.clientHeight);
    },

    handleSplitChange(kind: "graph" | "both" | "list") {
      this.split = kind;

      // Update URL parameters, preserving current state
      updateUrlParams({
        mode: this.searchMode,
        search: this.searchMode === "normal" ? this.search.text || undefined : undefined,
        sparqlQuery:
          this.searchMode === "sparql" ? this.customSparqlQuery || undefined : undefined,
        sparqlPreset:
          this.searchMode === "sparql"
            ? this.selectedPresetQuery || undefined
            : undefined,
        view: kind === "both" ? null : kind,
      });
    },

    showArticle(node?: Node, scroll = false) {
      if (!node) {
        this.activeId = null;
        this.activeSparqlId = null;

        // Update URL to clear ID parameter, but preserve other parameters
        updateUrlParams({
          mode: this.searchMode,
          search:
            this.searchMode === "normal" ? this.search.text || undefined : undefined,
          sparqlQuery:
            this.searchMode === "sparql"
              ? this.customSparqlQuery || undefined
              : undefined,
          sparqlPreset:
            this.searchMode === "sparql"
              ? this.selectedPresetQuery || undefined
              : undefined,
          id: null,
        });

        // Refresh graph to remove glowing effect
        Graph.refresh();
        return;
      }

      // Handle clicking on graph nodes in SPARQL mode
      if (this.searchMode === "sparql" && this.sparqlFilters.active) {
        // Find the corresponding SPARQL result item
        const sparqlItem = this.sparqlFilters.data.find((item: any) => {
          const originalId = item.resource?.value?.split("/").pop() || item.id;
          return originalId === node.id;
        });

        if (sparqlItem) {
          // Find the corresponding item in visibleNodes to get the SPARQL ID
          const visibleItem = this.visibleNodes.find(
            (item: any) => item.originalId === node.id
          );

          if (visibleItem) {
            this.activeSparqlId = visibleItem.id;
            this.activeId = node.id; // Keep for graph highlighting

            // Update graph highlighting
            const config = Graph.graphData();
            for (let i = 0; i < config.nodes.length; i++) {
              config.nodes[i].value = config.nodes[i].id === node.id ? 70 : 4;
            }
            Graph.graphData(config);
            Graph.refresh();

            this.article.content = visibleItem;
            this.article.show = true;

            // Handle scrolling to the card in the list
            if (this.split !== "graph" && scroll) {
              const index = this.visibleNodes.findIndex(
                (n: any) => n.id === visibleItem.id
              );
              if (index >= 0) {
                this.$nextTick(() =>
                  requestAnimationFrame(() => {
                    this.$refs.list.scrollToIndex(index);
                  })
                );
              }
            }

            // Update URL with original ID, preserving SPARQL query and preset
            updateUrlParams({
              mode: this.searchMode,
              sparqlQuery: this.customSparqlQuery || undefined,
              sparqlPreset: this.selectedPresetQuery || undefined,
              id: node.id,
            });
            return;
          }
        }
      }

      // Handle SPARQL mode card clicks (existing logic)
      if (this.searchMode === "sparql" && node.id?.startsWith("sparql_")) {
        this.activeSparqlId = node.id;
        this.activeId = null; // Clear normal mode active ID

        // Find the corresponding node in the filtered graph using originalId
        const originalId = (node as any).originalId;
        if (originalId) {
          const config = Graph.graphData();

          // Find the node in the current graph data
          const graphNode = config.nodes.find((n: any) => n.id === originalId);
          if (graphNode) {
            // Update graph highlighting
            for (let i = 0; i < config.nodes.length; i++) {
              config.nodes[i].value = config.nodes[i].id === originalId ? 70 : 4;
            }

            Graph.graphData(config);
            Graph.refresh();

            // Set activeId for graph synchronization
            this.activeId = originalId;
          }
        }

        this.article.content = node;
        this.article.show = true;

        // Handle scrolling in SPARQL mode
        if (this.split !== "graph" && scroll) {
          const index = this.visibleNodes.findIndex((n: any) => n.id === node.id);
          if (index >= 0) {
            this.$nextTick(() =>
              requestAnimationFrame(() => {
                this.$refs.list.scrollToIndex(index);
              })
            );
          }
        }

        // Set URL to the original ID if available, preserving SPARQL query and preset
        const urlId = (node as any).originalId || node.id;
        updateUrlParams({
          mode: this.searchMode,
          sparqlQuery: this.customSparqlQuery || undefined,
          sparqlPreset: this.selectedPresetQuery || undefined,
          id: urlId,
        });
        return;
      }

      // Normal mode handling
      this.activeId = node.id;
      this.activeSparqlId = null; // Clear SPARQL mode active ID

      // Update URL with the selected ID, preserving current mode parameters
      updateUrlParams({
        mode: this.searchMode,
        search: this.searchMode === "normal" ? this.search.text || undefined : undefined,
        sparqlQuery:
          this.searchMode === "sparql" ? this.customSparqlQuery || undefined : undefined,
        sparqlPreset:
          this.searchMode === "sparql"
            ? this.selectedPresetQuery || undefined
            : undefined,
        id: this.activeId,
      });

      const config = Graph.graphData();

      let i = 0;
      for (i = 0; i < config.nodes.length; i++) {
        config.nodes[i].value = config.nodes[i].id === node.id ? 70 : 4;
      }

      Graph.graphData(config);

      // Refresh the graph to apply glowing effect to the new active node
      Graph.refresh();

      this.article.content = node;
      this.article.show = true;

      if (this.split !== "list") {
        this.center(node);
      }

      if (this.split !== "graph" && scroll) {
        const index = Graph.graphData().nodes.findIndex((n) => n.id === node.id);

        this.$nextTick(() =>
          // wait for Vue to paint
          requestAnimationFrame(() => {
            // wait for VVirtualScroll to measure
            this.$refs.list.scrollToIndex(index);
          })
        );
      }
    },

    center(node) {
      const distance = 1000;
      const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

      const newPos =
        node.x || node.y || node.z
          ? { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }
          : { x: 0, y: 0, z: distance }; // special case if node is in (0,0,0)

      Graph.cameraPosition(
        newPos, // new position
        node, // lookAt ({ x, y, z })
        3000 // ms transition duration
      );
    },

    load(id: string) {
      window.open(`https://bildungsportal.sachsen.de/opal/oer/${id}`, "_blank");
    },

    loadConnections(node) {
      /* ---------- helpers & cached look‑ups ---------- */
      const live = Graph.graphData(); // current graph
      const dbNode = new Map(database.nodes.map((n) => [n.id, n])); // O(1) lookup

      const keepIds = new Set(live.nodes.map((n) => n.id)); // nodes we already show
      const newLinks = live.links.map((link) => {
        return { source: link.source.id, target: link.target.id };
      }); // fresh array copy

      let updates = false;
      /* ---------- scan the full link table once ---------- */
      for (const { source, target } of database.links) {
        const sId = typeof source === "object" ? source.id : source;
        const tId = typeof target === "object" ? target.id : target;

        // only links that touch the clicked id *and* whose endpoints both exist
        if ((sId === node.id || tId === node.id) && dbNode.has(sId) && dbNode.has(tId)) {
          newLinks.push({ source: sId, target: tId });
          keepIds.add(sId).add(tId); // Set.add is chain‑able

          updates = true;
        }
      }

      if (!updates) {
        return;
      }

      /* ---------- build the matching node list ---------- */
      const newNodes = resetNodePositions(Array.from(keepIds, (id) => dbNode.get(id)));

      /* ---------- update the graph ---------- */

      for (let i = 0; i < newNodes.length; i++) {
        newNodes[i].value = newNodes[i].id === node.id ? 50 : 4;
      }

      Graph.graphData({ nodes: newNodes, links: newLinks }); //.d3ReheatSimulation(); // optional: settle layout again

      // Refresh the graph to apply glowing effect
      Graph.refresh();

      this.updateCounters({ nodes: newNodes, links: newLinks });

      if (this.split === "both") {
        this.$nextTick(() =>
          // wait for Vue to paint
          requestAnimationFrame(() => {
            const index = Graph.graphData().nodes.findIndex((n) => n.id === node.id);
            // wait for VVirtualScroll to measure
            this.$refs.list.scrollToIndex(index);
          })
        );
      }
    },

    toggleTitle() {
      Graph.pauseAnimation();
      this.settings.title = !this.settings.title;

      // Update URL parameters, preserving current state
      updateUrlParams({
        mode: this.searchMode,
        search: this.searchMode === "normal" ? this.search.text || undefined : undefined,
        sparqlQuery:
          this.searchMode === "sparql" ? this.customSparqlQuery || undefined : undefined,
        sparqlPreset:
          this.searchMode === "sparql"
            ? this.selectedPresetQuery || undefined
            : undefined,
        title: this.settings.title ? "1" : null,
      });

      Graph.refresh();
      Graph.resumeAnimation();
      Graph.d3ReheatSimulation();
    },

    // SPARQL filtering methods
    async executeSparqlQuery(queryConfig: any) {
      console.log("Executing SPARQL query:", queryConfig.name);

      // Load the preset query into the custom query field
      this.customSparqlQuery = queryConfig.query;

      // Set the selected preset by key
      this.selectedPresetQuery = queryConfig.key;

      // Update URL parameters
      updateUrlParams({
        mode: "sparql",
        sparqlQuery: queryConfig.query,
        sparqlPreset: queryConfig.key,
      });

      // Execute the query
      await this.executeCustomSparqlQuery();
    },

    clearSparqlFilters() {
      console.log("Clearing SPARQL filters");

      // Update URL parameters to remove SPARQL-specific params
      updateUrlParams({
        mode: "sparql",
        sparqlQuery: null,
        sparqlPreset: null,
        id: null,
      });

      // Show empty graph instead of all data
      const emptyGraphData = { nodes: [], links: [] };
      Graph.graphData(emptyGraphData);
      this.updateCounters(emptyGraphData);

      // Clear filter state
      this.sparqlFilters.active = false;
      this.sparqlFilters.data = [];
      this.sparqlFilters.currentQuery = "";
      this.sparqlFilters.loading = false;
      this.sparqlFilters.error = null; // Clear errors
      this.sparqlFilters.originalData = null; // Reset original data reference
      this.selectedPresetQuery = null;
      this.customSparqlQuery = "";
      this.activeSparqlId = null;

      Graph.resumeAnimation();
    },

    // SPARQL Interface Methods
    toggleSparqlInterface() {
      this.showSparqlInterface = !this.showSparqlInterface;
    },

    loadPresetQuery(index: number) {
      if (index !== null && this.sparqlQueries[index]) {
        this.customSparqlQuery = this.sparqlQueries[index].query;
      }
    },

    loadPresetQueryByKey(key: string) {
      if (key) {
        const query = this.sparqlQueries.find((q) => q.key === key);
        if (query) {
          this.customSparqlQuery = query.query;
        }
      }
    },

    async executeCustomSparqlQuery() {
      if (!this.customSparqlQuery.trim()) {
        console.warn("No SPARQL query provided");
        return;
      }

      console.log("Executing custom SPARQL query");

      // Update URL parameters before executing query
      updateUrlParams({
        mode: "sparql",
        sparqlQuery: this.customSparqlQuery,
        sparqlPreset: this.selectedPresetQuery,
      });

      // Create new AbortController for this query
      this.sparqlFilters.abortController = new AbortController();
      this.sparqlFilters.loading = true;
      this.sparqlFilters.error = null; // Clear previous errors

      try {
        // Execute the custom SPARQL query with abort signal
        const results = await Promise.race([
          sparqlEngine.executeSelectQuery(this.customSparqlQuery),
          new Promise((_, reject) => {
            this.sparqlFilters.abortController?.signal.addEventListener("abort", () => {
              reject(new Error("Query execution was cancelled by user"));
            });
          }),
        ]);

        console.log("Custom SPARQL results:", results);

        if (results && results.length > 0) {
          // Store original data if not already stored
          if (!this.sparqlFilters.originalData) {
            this.sparqlFilters.originalData = { ...database };
          }

          // Map SPARQL results to existing node format
          const sparqlNodeIds = new Set(
            results
              .map((item: any) => item.resource?.value?.split("/").pop() || item.id)
              .filter((id: string) => id) // Remove empty IDs
          );

          // Filter nodes that exist in both SPARQL results and original database
          const filteredNodes = database.nodes.filter((node) =>
            sparqlNodeIds.has(node.id)
          );

          // Filter links to only include connections between filtered nodes
          const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
          const filteredLinks = database.links.filter((link) => {
            const sourceId =
              typeof link.source === "object" ? link.source.id : link.source;
            const targetId =
              typeof link.target === "object" ? link.target.id : link.target;
            return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
          });

          // Update graph with filtered data
          const graphData = {
            nodes: resetNodePositions(filteredNodes),
            links: filteredLinks,
          };

          Graph.graphData(graphData)
            .cooldownTicks(100)
            .d3ReheatSimulation()
            .zoomToFit(600, 40);

          // Update counters and state
          this.updateCounters(graphData);
          this.sparqlFilters.active = true;
          this.sparqlFilters.data = results;

          // Determine if this is a preset query or custom
          const matchingPreset = this.sparqlQueries.find(
            (q) => q.query.trim() === this.customSparqlQuery.trim()
          );
          this.sparqlFilters.currentQuery = matchingPreset
            ? matchingPreset.key
            : "custom";

          Graph.resumeAnimation();

          console.log(`Applied custom SPARQL filter (${filteredNodes.length} nodes)`);
        } else {
          console.warn("No results found for custom SPARQL query");
          this.sparqlFilters.error =
            "No results found for this SPARQL query. Please check your query syntax and try again.";
        }
      } catch (error) {
        console.error("Error executing custom SPARQL query:", error);

        // Extract meaningful error message
        let errorMessage = "Unknown error occurred while executing SPARQL query.";

        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === "string") {
          errorMessage = error;
        } else if (error && typeof error === "object" && "message" in error) {
          errorMessage = error.message;
        }

        // Store the error for display
        this.sparqlFilters.error = `SPARQL Query Error: ${errorMessage}`;
      } finally {
        this.sparqlFilters.loading = false;
        this.sparqlFilters.abortController = null; // Clean up abort controller
      }
    },

    // Stop the currently running SPARQL query
    stopSparqlQuery() {
      if (this.sparqlFilters.abortController) {
        console.log("Stopping SPARQL query execution");
        this.sparqlFilters.abortController.abort();
        this.sparqlFilters.abortController = null;
        this.sparqlFilters.loading = false;
        this.sparqlFilters.error = "Query execution was cancelled by user";
      }
    },

    handleSparqlFilterApplied(sparqlData: Node[]) {
      console.log("SPARQL filter applied:", sparqlData);

      // Store original data if not already stored
      if (!this.sparqlFilters.originalData) {
        this.sparqlFilters.originalData = { ...database };
      }

      // Map SPARQL results to existing node IDs
      const sparqlNodeIds = new Set(
        sparqlData.map((item) => item.id).filter((id) => id) // Remove empty IDs
      );

      // Filter nodes that exist in both SPARQL results and original database
      const filteredNodes = database.nodes.filter((node) => sparqlNodeIds.has(node.id));

      // Filter links to only include connections between filtered nodes
      const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
      const filteredLinks = database.links.filter((link) => {
        const sourceId = typeof link.source === "object" ? link.source.id : link.source;
        const targetId = typeof link.target === "object" ? link.target.id : link.target;
        return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
      });

      // Update graph with filtered data
      const graphData = {
        nodes: resetNodePositions(filteredNodes),
        links: filteredLinks,
      };

      Graph.graphData(graphData)
        .cooldownTicks(100)
        .d3ReheatSimulation()
        .zoomToFit(600, 40);

      // Update counters and state
      this.updateCounters(graphData);
      this.sparqlFilters.active = true;
      this.sparqlFilters.data = sparqlData;

      Graph.resumeAnimation();
    },

    handleSparqlItemSelected(item: any) {
      console.log("SPARQL item selected:", item);

      // Find the corresponding node in the graph
      const nodeId = item.resource?.value?.split("/").pop() || item.id;
      const node = Graph.graphData().nodes.find((n: Node) => n.id === nodeId);

      if (node) {
        this.showArticle(node, true);
        this.open.sparql = false; // Close modal
      }
    },

    handleSparqlFiltersCleared() {
      console.log("SPARQL filters cleared");

      // Restore original data
      if (this.sparqlFilters.originalData) {
        Graph.graphData(this.sparqlFilters.originalData)
          .d3ReheatSimulation()
          .zoomToFit(600, 40);

        this.updateCounters(this.sparqlFilters.originalData);
      }

      // Clear filter state
      this.sparqlFilters.active = false;
      this.sparqlFilters.data = [];

      Graph.resumeAnimation();
    },

    // Copy ID to clipboard method
    async copyIdToClipboard(id: string, event?: Event) {
      if (event) {
        event.stopPropagation(); // Prevent card click event
      }

      try {
        await navigator.clipboard.writeText(id);
        console.log(`Copied ID to clipboard: ${id}`);

        // You could add a toast notification here if desired
        // For now, we'll just log to console
      } catch (error) {
        console.error("Failed to copy ID to clipboard:", error);

        // Fallback for older browsers
        try {
          const textArea = document.createElement("textarea");
          textArea.value = id;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          console.log(`Copied ID to clipboard (fallback): ${id}`);
        } catch (fallbackError) {
          console.error("Fallback copy method also failed:", fallbackError);
        }
      }
    },

    // Helper methods for generic SPARQL field display
    getAdditionalSparqlFields(sparqlData: any) {
      if (!sparqlData) return {};

      // Define standard fields that are already displayed elsewhere
      const standardFields = new Set([
        "resource",
        "title",
        "creator",
        "type",
        "format",
        "subject",
        "subjects",
        "description",
        "publisher",
        "affiliation",
        "authors",
        "tag",
        "summary",
        "file",
        "id",
        "originalId",
      ]);

      const additionalFields: Record<string, any> = {};

      // Extract additional fields from SPARQL data
      Object.keys(sparqlData).forEach((key) => {
        if (!standardFields.has(key) && sparqlData[key]?.value !== undefined) {
          additionalFields[key] = sparqlData[key].value;
        }
      });

      return additionalFields;
    },

    formatFieldName(fieldName: string) {
      // Convert camelCase or snake_case to readable format
      return fieldName
        .replace(/([A-Z])/g, " $1") // Add space before uppercase
        .replace(/_/g, " ") // Replace underscores with spaces
        .replace(/\b\w/g, (l) => l.toUpperCase()) // Capitalize first letter of each word
        .trim();
    },

    formatFieldValue(value: any) {
      if (value === null || value === undefined) return "N/A";

      // Handle different value types
      if (typeof value === "number") {
        // Format numbers with appropriate precision
        if (value % 1 === 0) return value.toString();
        return Number(value).toFixed(3);
      }

      if (typeof value === "boolean") {
        return value ? "Yes" : "No";
      }

      // Handle URIs - extract just the local name
      if (typeof value === "string" && value.includes("/")) {
        const parts = value.split("/");
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart !== value) {
          return lastPart;
        }
      }

      return String(value);
    },
  },

  computed: {
    visibleNodes() {
      /* establish the dependency */
      this.version;

      if (!Graph) return [];

      // Return SPARQL data in the list if filters are active
      if (this.sparqlFilters.active && this.sparqlFilters.data.length > 0) {
        // Convert SPARQL data to display format for the list
        return this.sparqlFilters.data.map((item, index) => ({
          id: `sparql_${index}_${item.resource?.value?.split("/").pop() || item.id}`,
          title: item.title?.value,
          type: item.type?.value?.split("/").pop(),
          file: item.format?.value,
          affiliation: item.creator?.value?.split("/").pop() || "",
          summary:
            item.description?.value ||
            item.subjects?.value ||
            item.subject?.value?.split("/").pop() ||
            "",
          authors: item.creator?.value?.split("/").pop() || "",
          tag: item.subjects?.value
            ? item.subjects.value
                .split(", ")
                .map((s) => s.split("/").pop())
                .filter(Boolean)
            : item.subject?.value
            ? [item.subject.value.split("/").pop()]
            : [],
          sparqlData: item,
          originalId: item.resource?.value?.split("/").pop() || item.id,
        }));
      }

      return Graph.graphData().nodes;
    },
  },

  watch: {
    searchMode(newMode, oldMode) {
      // Update URL when search mode changes
      updateUrlParams({
        mode: newMode,
        search: newMode === "normal" ? this.search.text : null,
        sparqlQuery: newMode === "sparql" ? this.customSparqlQuery : null,
        sparqlPreset: newMode === "sparql" ? this.selectedPresetQuery : null,
      });

      // Clear SPARQL filters when switching to normal search mode
      if (newMode === "normal" && oldMode === "sparql" && this.sparqlFilters.active) {
        this.clearSparqlFilters();
      }

      // Clear active selections when switching modes
      if (newMode === "normal") {
        this.activeSparqlId = null;
        // Keep activeId for graph highlighting
      } else if (newMode === "sparql") {
        // Keep activeId for potential graph highlighting
        // Clear activeSparqlId to start fresh
        this.activeSparqlId = null;
      }
    },
  },

  async mounted() {
    await this.$nextTick();
    this.initGraph();
  },

  beforeUnmount() {
    this.resizeObserver.disconnect();
  },
};
</script>

<template>
  <v-card class="mx-auto">
    <v-layout class="d-flex flex-column" style="height: 100vh">
      <v-app-bar density="compact" class="flex-shrink-0">
        <template v-slot:prepend> </template>

        <v-app-bar-title>
          OER-Graph (<span ref="nodes">0</span>/<span ref="links">0</span>)
          <v-chip v-if="sparqlFilters.active" color="accent" size="small" class="ml-2">
            SPARQL Filtered
          </v-chip>
        </v-app-bar-title>
        <v-spacer />
        <v-text-field
          v-show="searchMode === 'normal'"
          :loading="search.loading"
          v-model="search.text"
          append-inner-icon="mdi-magnify"
          density="compact"
          label="Suche"
          variant="outlined"
          hide-details
          single-line
          @click:append-inner="handleSearch"
          @keyup.enter="handleSearch"
        ></v-text-field>
        <v-spacer />
        <template v-slot:append>
          <!-- Search Mode Toggle -->
          <v-btn-toggle
            v-model="searchMode"
            density="compact"
            variant="outlined"
            mandatory
            class="mr-2"
          >
            <v-btn value="normal" size="small" icon="mdi-magnify" />
            <v-btn value="sparql" size="small" icon="mdi-database-search" />
          </v-btn-toggle>

          <v-menu>
            <template v-slot:activator="{ props }">
              <v-btn icon="mdi-dots-vertical" v-bind="props"></v-btn>
            </template>

            <v-list density="compact">
              <v-list-item
                title="Beschreibung"
                prepend-icon="mdi-information-outline"
                @click="open.description = true"
              />
              <v-list-item
                :title="
                  settings.title ? 'Titel im Graph ausblenden' : 'Titel im Graph zeigen'
                "
                :prepend-icon="
                  settings.title
                    ? 'mdi-vector-polyline-minus'
                    : 'mdi-vector-polyline-plus'
                "
                @click="toggleTitle"
              />
              <v-list-item title="Darstellung:" prepend-icon="mdi-information-outline" />
              <v-list-item>
                <v-radio-group
                  v-model="split"
                  @update:model-value="handleSplitChange"
                  class="pl-13 pt-0"
                  density="compact"
                >
                  <v-radio label="Graph" value="graph"></v-radio>
                  <v-radio label="Beides" value="both"></v-radio>
                  <v-radio label="Liste" value="list"></v-radio>
                </v-radio-group>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>
      </v-app-bar>
      <v-main class="flex-grow-1 overflow-hidden">
        <splitpanes
          :horizontal="orientation !== 'horizontal'"
          class="default-theme"
          style="max-height: calc(100vh - 48px)"
        >
          <pane :size="split === 'graph' ? 100 : split === 'both' ? 70 : 0">
            <div ref="graph" id="graph"></div>

            <v-card
              class="info-card mx-auto"
              style="overflow: auto; max-width: 344px"
              hover
              v-show="article.show && this.split === 'graph'"
            >
              <v-btn
                icon="mdi-close"
                variant="text"
                size="small"
                class="position-absolute top-0 right-0 mt-1 mr-1"
                aria-label="Close"
                @click="article.show = false"
              />
              <v-card-item style="margin-top: 1rem">
                <div class="d-flex justify-space-between align-start mb-2">
                  <v-card-title
                    class="no-ellipsis pa-0"
                    style="
                      flex: 1;
                      min-width: 0;
                      word-break: break-word;
                      line-height: 1.2;
                    "
                  >
                    {{ article.content?.title }}
                  </v-card-title>
                  <v-chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    class="ml-2"
                    style="font-family: monospace; flex-shrink: 0; cursor: pointer"
                    @click="
                      copyIdToClipboard(
                        searchMode === 'sparql' && article.content?.originalId
                          ? article.content?.originalId
                          : article.content?.id,
                        $event
                      )
                    "
                    title="Click to copy ID"
                  >
                    {{
                      searchMode === "sparql" && article.content?.originalId
                        ? article.content?.originalId
                        : article.content?.id
                    }}
                  </v-chip>
                </div>

                <v-card-subtitle
                  v-show="article.content?.authors || article.content?.affiliation"
                >
                  {{ article.content?.authors }}

                  <span v-show="article.content?.authors && article.content?.affiliation"
                    >-</span
                  >

                  <span v-show="article.content?.affiliation">
                    (<i> {{ article.content?.affiliation }} </i>)
                  </span>
                </v-card-subtitle>
              </v-card-item>

              <v-card-text style="max-height: 400px; overflow: auto">
                {{ article.content?.summary }}
                <ul
                  v-show="article.content?.tag?.length"
                  class="pa-0 ma-0"
                  style="list-style: none"
                >
                  <li v-for="tag in article.content?.tag || []">{{ tag }}</li>
                </ul>

                <span v-show="article.content?.type || article.content?.file"
                  >Typ: {{ article.content?.type }} / {{ article.content?.file }}</span
                >

                <!-- Generic SPARQL fields display -->
                <div
                  v-if="searchMode === 'sparql' && article.content?.sparqlData"
                  class="mt-2"
                >
                  <div
                    v-for="(value, key) in getAdditionalSparqlFields(
                      article.content.sparqlData
                    )"
                    :key="key"
                    class="mb-1"
                  >
                    <strong>{{ formatFieldName(key) }}:</strong>
                    {{ formatFieldValue(value) }}
                  </div>
                </div>
              </v-card-text>

              <v-card-actions class="pt-0">
                <v-btn
                  color="teal-accent-4"
                  text="Download"
                  variant="text"
                  @click="load(article.content?.id)"
                ></v-btn>

                <v-btn
                  color="teal-accent-4"
                  text="Erweitern"
                  variant="text"
                  @click="loadConnections(article.content)"
                ></v-btn>
              </v-card-actions>
            </v-card>
          </pane>

          <pane
            :size="split === 'graph' ? 0 : split === 'both' ? 30 : 100"
            style="background-color: black"
          >
            <!-- SPARQL Query Interface Header -->
            <v-card
              v-if="split !== 'graph' && searchMode === 'sparql'"
              class="ma-2 mb-0"
              style="background-color: #1e1e1e; border: 1px solid #333"
            >
              <v-card-title class="pb-2">
                <v-icon color="accent" class="mr-2">mdi-database-search</v-icon>
                SPARQL Query Interface
                <v-spacer />
                <v-chip v-if="sparqlFilters.active" color="accent" size="small">
                  Active Filter
                </v-chip>
              </v-card-title>

              <v-card-text class="pt-0" v-show="showSparqlInterface">
                <!-- Predefined Query Dropdown -->
                <div class="mb-3">
                  <v-select
                    v-model="selectedPresetQuery"
                    :items="sparqlQueries"
                    item-title="name"
                    item-value="key"
                    label="Select a predefined query"
                    prepend-icon="mdi-database-search"
                    variant="outlined"
                    density="compact"
                    clearable
                    @update:model-value="loadPresetQueryByKey"
                    class="mb-2"
                  />
                </div>

                <!-- Custom Query Textarea -->
                <v-textarea
                  v-model="customSparqlQuery"
                  label="Custom SPARQL Query"
                  placeholder="PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator .
} LIMIT 50"
                  rows="8"
                  variant="outlined"
                  style="font-family: 'Courier New', monospace; background-color: #2d2d2d"
                  hide-details
                  density="compact"
                />

                <!-- Error Display -->
                <v-alert
                  v-if="sparqlFilters.error"
                  type="error"
                  variant="tonal"
                  closable
                  class="mt-3"
                  @click:close="sparqlFilters.error = null"
                >
                  <v-alert-title>
                    <v-icon class="mr-2">mdi-alert-circle</v-icon>
                    Query Execution Failed
                  </v-alert-title>
                  <div
                    class="mt-2"
                    style="font-family: 'Courier New', monospace; font-size: 0.9em"
                  >
                    {{ sparqlFilters.error }}
                  </div>
                </v-alert>

                <!-- Action Buttons -->
                <div class="d-flex justify-space-between mt-3">
                  <div>
                    <v-btn
                      @click="executeCustomSparqlQuery"
                      :loading="sparqlFilters.loading"
                      :disabled="sparqlFilters.loading"
                      color="accent"
                      variant="elevated"
                      size="small"
                      prepend-icon="mdi-play"
                    >
                      Execute Query
                    </v-btn>

                    <v-btn
                      v-if="sparqlFilters.loading"
                      @click="stopSparqlQuery"
                      color="warning"
                      variant="elevated"
                      size="small"
                      prepend-icon="mdi-stop"
                      class="ml-2"
                    >
                      Stop Query
                    </v-btn>

                    <v-btn
                      v-if="sparqlFilters.active && !sparqlFilters.loading"
                      @click="clearSparqlFilters"
                      color="error"
                      variant="outlined"
                      size="small"
                      prepend-icon="mdi-close"
                      class="ml-2"
                    >
                      Clear Filter
                    </v-btn>
                  </div>

                  <div>
                    <v-btn
                      @click="toggleSparqlInterface"
                      variant="text"
                      size="small"
                      :icon="showSparqlInterface ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                    />
                  </div>
                </div>
              </v-card-text>
            </v-card>

            <v-virtual-scroll
              :key="version"
              ref="list"
              :items="visibleNodes"
              :height="
                split !== 'graph'
                  ? searchMode === 'sparql'
                    ? showSparqlInterface
                      ? 'calc(100vh - 350px)'
                      : 'calc(100vh - 120px)'
                    : 'calc(100vh - 48px)'
                  : 'calc(100vh - 48px)'
              "
            >
              <template v-slot:default="{ item }">
                <div class="pa-2">
                  <v-card
                    class="mx-auto"
                    :class="{
                      'border-accent':
                        searchMode === 'sparql'
                          ? item.id === this.activeSparqlId
                          : item.id === this.activeId,
                    }"
                    :style="
                      (
                        searchMode === 'sparql'
                          ? item.id === this.activeSparqlId
                          : item.id === this.activeId
                      )
                        ? 'border: 2px solid orange'
                        : ''
                    "
                    hover
                    @click="showArticle(item)"
                  >
                    <v-card-item style="margin-top: 1rem">
                      <div class="d-flex justify-space-between align-start mb-2">
                        <v-card-title
                          class="no-ellipsis pa-0"
                          style="
                            flex: 1;
                            min-width: 0;
                            word-break: break-word;
                            line-height: 1.2;
                          "
                        >
                          {{ item.title }}
                        </v-card-title>
                        <v-chip
                          size="small"
                          color="primary"
                          variant="outlined"
                          class="ml-2"
                          style="font-family: monospace; flex-shrink: 0; cursor: pointer"
                          @click="
                            copyIdToClipboard(
                              searchMode === 'sparql' && item.originalId
                                ? item.originalId
                                : item.id,
                              $event
                            )
                          "
                          title="Click to copy ID"
                        >
                          {{
                            searchMode === "sparql" && item.originalId
                              ? item.originalId
                              : item.id
                          }}
                        </v-chip>
                      </div>

                      <v-card-subtitle>
                        {{ item.authors }}

                        <span v-show="item.authors && item.affiliation">-</span>

                        <span v-show="item.affiliation">
                          (<i> {{ item.affiliation }} </i>)
                        </span>
                      </v-card-subtitle>
                    </v-card-item>

                    <v-card-text>
                      {{ item.summary }}
                      <ul
                        v-show="item.tag?.length"
                        class="pa-0 ma-0"
                        style="list-style: none"
                      >
                        <li v-for="tag in item.tag || []">{{ tag }}</li>
                      </ul>

                      <span v-show="item.type || item.file"
                        >Typ: {{ item.type }} / {{ item.file }}</span
                      >

                      <!-- Generic SPARQL fields display -->
                      <div v-if="searchMode === 'sparql' && item.sparqlData" class="mt-2">
                        <div
                          v-for="(value, key) in getAdditionalSparqlFields(
                            item.sparqlData
                          )"
                          :key="key"
                          class="mb-1"
                        >
                          <strong>{{ formatFieldName(key) }}:</strong>
                          {{ formatFieldValue(value) }}
                        </div>
                      </div>
                    </v-card-text>

                    <v-card-actions class="pt-0">
                      <v-btn
                        color="teal-accent-4"
                        text="Download"
                        variant="text"
                        @click.stop="
                          load(
                            searchMode === 'sparql' && item.originalId
                              ? item.originalId
                              : item.id
                          )
                        "
                      ></v-btn>

                      <v-btn
                        color="teal-accent-4"
                        text="Erweitern"
                        variant="text"
                        @click.stop="loadConnections(item)"
                      ></v-btn>
                    </v-card-actions>
                  </v-card>
                </div>
              </template>
            </v-virtual-scroll>
          </pane>
        </splitpanes>
      </v-main>
    </v-layout>
  </v-card>

  <v-dialog v-model="open.description" width="auto">
    <v-card max-width="800" prepend-icon="mdi-information-outline" title="Beschreibung">
      <template v-slot:actions>
        <v-btn class="ms-auto" text="Ok" @click="open.description = false"></v-btn>
      </template>

      <v-card-text>
        Diese Karte zeigt das <i>Netzwerk</i> aller OER-Inhalte des sächsischen
        OPAL-Systems. Jeder <i>Knoten</i> stellt einen OER-Inhalt dar und jede Kante eine
        Ähnlichkeitsbeziehung zwischen den Beiträgen. <br /><br />
        <strong>SPARQL-Filter:</strong> Verwenden Sie die SPARQL-Abfrage-Oberfläche, um
        die angezeigten Inhalte zu filtern und spezifische Lernressourcen zu finden.
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style>
#graph {
  width: 100%;
  max-height: calc(100vh - 48px);
  background-color: black;
}

.info-card {
  position: absolute !important;
  z-index: 100;
  left: 1rem;
  bottom: 1rem;
  overflow: auto;
  background-color: #7778 !important;
}

.no-ellipsis {
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important; /* or 'clip' */
  word-break: break-word; /* long words won't bust the card */
}

ul {
  margin: 1rem;
}

#information {
  position: absolute;
  top: 3.5rem;
  left: 1rem;
  z-index: 1000;
  color: white;
}

.node-label {
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.25);
  user-select: none;
}

/* Glowing animation for active nodes */
@keyframes glow-pulse {
  0% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
  100% {
    opacity: 0.8;
    transform: scale(1);
  }
}

.active-node-glow {
  animation: glow-pulse 2s ease-in-out infinite;
}
</style>
