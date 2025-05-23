import { useSigma } from "@react-sigma/core";
import { keyBy, mapValues, sortBy, values } from "lodash";
import { FC, useEffect, useMemo, useState } from "react";
import { AiOutlineCheckCircle, AiOutlineCloseCircle } from "react-icons/ai";
import { MdCategory } from "react-icons/md";

import { FiltersState, Tag } from "../types";
import Panel from "./Panel";

const TagsPanel: FC<{
  tags: Tag[];
  filters: FiltersState;
  toggleTag: (tag: string) => void;
  setTags: (tags: Record<string, boolean>) => void;
}> = ({ tags, filters, toggleTag, setTags }) => {
  const sigma = useSigma();
  const graph = sigma.getGraph();

  const nodesPerTag = useMemo(() => {
    const index: Record<string, number> = {};
    graph.forEachNode((_, attributes) => {
      if (Array.isArray(attributes.tags)) {
        // Handle multiple tags per node
        attributes.tags.forEach(tag => {
          index[tag] = (index[tag] || 0) + 1;
        });
      } else if (attributes.tag) {
        // Fallback for backward compatibility
        index[attributes.tag] = (index[attributes.tag] || 0) + 1;
      }
    });
    return index;
  }, []);

  const maxNodesPerTag = useMemo(() => Math.max(...values(nodesPerTag)), [nodesPerTag]);
  const visibleTagsCount = useMemo(() => Object.keys(filters.tags).length, [filters]);

  const [visibleNodesPerTag, setVisibleNodesPerTag] = useState<Record<string, number>>(nodesPerTag);
  useEffect(() => {
    // To ensure the graphology instance has up to date "hidden" values for
    // nodes, we wait for next frame before reindexing. This won't matter in the
    // UX, because of the visible nodes bar width transition.
    requestAnimationFrame(() => {
      const index: Record<string, number> = {};
      graph.forEachNode((_, attributes) => {
        if (!attributes.hidden) {
          if (Array.isArray(attributes.tags)) {
            // Handle multiple tags per node
            attributes.tags.forEach(tag => {
              index[tag] = (index[tag] || 0) + 1;
            });
          } else if (attributes.tag) {
            // Fallback for backward compatibility
            index[attributes.tag] = (index[attributes.tag] || 0) + 1;
          }
        }
      });
      setVisibleNodesPerTag(index);
    });
  }, [filters]);

  const sortedTags = useMemo(
    () => sortBy(tags, (tag) => (tag.key === "unknown" ? Infinity : -nodesPerTag[tag.key])),
    [tags, nodesPerTag],
  );

  return (
    <Panel
      title={
        <>
          <MdCategory className="text-muted" /> Klassifikation
          {visibleTagsCount < tags.length ? (
            <span className="text-muted text-small">
              {" "}
              ({visibleTagsCount} / {tags.length})
            </span>
          ) : (
            ""
          )}
        </>
      }
    >
      <p>
        <i className="text-muted">Klicken Sie auf eine Klasse um verwandte OER-Beiträge zu zeigen.</i>
      </p>
      <p className="buttons">
        <button className="btn" onClick={() => setTags(mapValues(keyBy(tags, "key"), () => true))}>
          <AiOutlineCheckCircle /> Alle auswählen
        </button>{" "}
        <button className="btn" onClick={() => setTags({})}>
          <AiOutlineCloseCircle /> Alle abwählen
        </button>
      </p>
      <ul>
        {sortedTags.map((tag) => {
          const nodesCount = nodesPerTag[tag.key] || 0;
          const visibleNodesCount = visibleNodesPerTag[tag.key] || 0;
          return (
            <li
              className="caption-row"
              key={tag.key}
              title={`${nodesCount} page${nodesCount > 1 ? "s" : ""}${
                visibleNodesCount !== nodesCount
                  ? visibleNodesCount > 0
                    ? ` (only ${visibleNodesCount > 1 ? `${visibleNodesCount} are` : "one is"} visible)`
                    : " (all hidden)"
                  : ""
              }`}
            >
              <input
                type="checkbox"
                checked={filters.tags[tag.key] || false}
                onChange={() => toggleTag(tag.key)}
                id={`tag-${tag.key}`}
              />
              <label htmlFor={`tag-${tag.key}`}>
                <span className="circle" style={{ backgroundImage: `url(./images/${tag.image})` }} />{" "}
                <div className="node-label">
                  <span>{tag.key}</span>
                  <div className="bar" style={{ width: (100 * nodesCount) / maxNodesPerTag + "%" }}>
                    <div
                      className="inside-bar"
                      style={{
                        width: (100 * visibleNodesCount) / nodesCount + "%",
                      }}
                    />
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

export default TagsPanel;
