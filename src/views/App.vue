<script lang="ts">
import { Splitpanes, Pane } from "splitpanes";
import "splitpanes/dist/splitpanes.css";

//import { VRButton } from "../../node_modules/three/examples/jsm/webxr/VRButton.js";
//import ForceGraph3D from "3d-force-graph";
import { includes, resetNodePositions, stringToColor } from "../utils";
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

      settings: {
        title: false,
      },

      article: {
        show: false,
        content: null,
      },

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
      const url = new URL(window.location.href);
      rawTerm
        ? url.searchParams.set("search", rawTerm)
        : url.searchParams.delete("search");
      history.replaceState({}, "", url); // no page reload

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
            .nodeColor((node) => stringToColor(node.tag[0]))
            .nodeVal((n) => n.value || 4)
            .onNodeRightClick((node) => {
              this.loadConnections(node);
            })
            .nodeThreeObject((node) => {
              if (this.settings.title) {
                const nodeEl = document.createElement("span");
                nodeEl.textContent =
                  node.title.length <= 25 ? node.title : node.title.slice(0, 25) + "...";
                nodeEl.style.color = stringToColor(node.tag[0]);
                nodeEl.className = "node-label";
                return new CSS2DObject(nodeEl);
              }
            })
            .nodeThreeObjectExtend(true)
            .onNodeClick((node) => this.showArticle(node, true))
            .nodeLabel((node) => `${node.title}`);

          // Enable WebXR
          const renderer = Graph.renderer();
          renderer.xr.enabled = true;

          Graph.pauseAnimation();
          //Graph.d3Force("charge").strength(-500);

          const params = new URLSearchParams(window.location.search);
          const initialSearch = params.get("search");
          const initialTitle = params.get("title");

          setTimeout(function () {
            if (initialTitle) {
              self.toggleTitle();
            }

            if (initialSearch) {
              self.search.text = initialSearch; // pre‑fill the field
              self.handleSearch(); // execute the search
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

    showArticle(node?: Node, scroll = false) {
      if (!node) return;

      this.activeId = node.id;

      const config = Graph.graphData();

      let i = 0;
      for (i = 0; i < config.nodes.length; i++) {
        config.nodes[i].value = config.nodes[i].id === node.id ? 70 : 4;
      }

      Graph.graphData(config);

      this.article.content = node;
      this.article.show = true;

      if (this.split === "both") {
        this.center(node);
        const index = Graph.graphData().nodes.findIndex((n) => n.id === node.id);
        if (scroll) {
          this.$nextTick(() =>
            // wait for Vue to paint
            requestAnimationFrame(() => {
              // wait for VVirtualScroll to measure
              this.$refs.list.scrollToIndex(index);
            })
          );
        }
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

      const url = new URL(window.location.href);
      if (this.settings.title) {
        url.searchParams.set("title", "1");
      } else {
        url.searchParams.delete("title");
      }
      history.replaceState({}, "", url);

      Graph.refresh();
      Graph.resumeAnimation();
      Graph.d3ReheatSimulation();
    },
  },

  computed: {
    visibleNodes() {
      /* establish the dependency */
      this.version;

      if (!Graph) return [];
      return Graph.graphData().nodes;
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

        <!--v-app-bar-title>OER-Graph</v-app-bar-title-->
        <v-spacer />
        <v-text-field
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
                prepend-icon="mdi-information-outline"
                @click="toggleTitle"
              />
            </v-list>
          </v-menu>
        </template>
      </v-app-bar>
      <v-main class="flex-grow-1 overflow-hidden">
        <splitpanes vertical class="default-theme" style="height: 100%">
          <pane size="70">
            <div ref="graph" id="graph" style="background-color: black"></div>

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
                <v-card-title class="no-ellipsis">
                  {{ article.content?.title }}
                </v-card-title>

                <v-card-subtitle>
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
                <ul>
                  <li v-for="tag in article.content?.tag || []">{{ tag }}</li>
                </ul>

                Typ: {{ article.content?.type }} / {{ article.content?.file }}
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

            <div id="information">
              <h1>OER Graph</h1>
              <span ref="nodes">0</span> Knoten, <span ref="links">0</span> Kanten
            </div>
          </pane>

          <pane min-size="20" style="background-color: black">
            <v-virtual-scroll
              :key="version"
              ref="list"
              :items="visibleNodes"
              height="calc(100vh - 48px)"
            >
              <template v-slot:default="{ item }">
                <div class="pa-2">
                  <v-card
                    class="mx-auto"
                    :style="item.id === this.activeId ? 'border: 2px solid orange' : ''"
                    hover
                    @click="showArticle(item)"
                  >
                    <v-card-item style="margin-top: 1rem">
                      <v-card-title class="no-ellipsis">
                        {{ item.title }}
                      </v-card-title>

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
                      <ul>
                        <li v-for="tag in item.tag || []">{{ tag }}</li>
                      </ul>

                      Typ: {{ item.type }} / {{ item.file }}
                    </v-card-text>

                    <v-card-actions class="pt-0">
                      <v-btn
                        color="teal-accent-4"
                        text="Download"
                        variant="text"
                        @click.stop="load(item.id)"
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
        Ähnlichkeitsbeziehung zwischen den Beiträgen.
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style>
#graph {
  width: 100%;
  height: 100%;
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
</style>
