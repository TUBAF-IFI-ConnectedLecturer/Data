<script lang="ts">
import { VRButton } from "../../node_modules/three/examples/jsm/webxr/VRButton.js";
//import ForceGraph3D from "3d-force-graph";

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

function resetNodePositions(nodes) {
  return nodes.map(({ x, y, z, vx, vy, vz, fx, fy, fz, ...rest }) => ({
    ...rest,
    x: undefined,
    y: undefined,
    z: undefined,
    vx: undefined,
    vy: undefined,
    vz: undefined,
    fx: undefined,
    fy: undefined,
    fz: undefined,
  }));
}

function includes(base: string, term: string) {
  base = base.toLowerCase();
  let terms = term.toLowerCase().split(" ");

  for (let t of terms) {
    if (!base.includes(t)) return false;
  }

  return true;
}

export default {
  name: "App",

  data() {
    return {
      search: {
        text: "",
        loading: false,
      },

      open: {
        description: false,
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
      const termIds = new Set(
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

      const links = database.links
        .filter(
          (l) =>
            termIds.has(l.source.id) ||
            termIds.has(l.target.id) ||
            termIds.has(l.source) ||
            termIds.has(l.target)
        )
        .map((l) => ({
          source: l.source.id || l.source,
          target: l.target.id || l.target,
        }));

      const nodes = resetNodePositions(
        database.nodes.filter(
          (n) =>
            termIds.has(n.id) ||
            links.some(
              (l) =>
                l.source === n.id ||
                l.target === n.id ||
                l.source.id === n.id ||
                l.target.id === n.id
            )
        )
      );

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
          database = json;

          this.updateCounters({ nodes: [], links: [] });

          Graph = new ForceGraph3D(this.$refs.graph)
            .graphData({ nodes: [], links: [] })
            .nodeAutoColorBy((node) => node.tag[0])
            .nodeLabel((node) => `${node.title}`)
            .onNodeClick((node) => this.load(node.id))
            .onNodeHover(this.handleHover);
          //.onNodeRightClick(showNodeInfo);

          // Enable WebXR
          const renderer = Graph.renderer();
          renderer.xr.enabled = true;

          Graph.pauseAnimation();

          const params = new URLSearchParams(window.location.search);
          const initialSearch = params.get("search");
          const self = this;
          if (initialSearch) {
            setTimeout(function () {
              self.search.text = initialSearch; // pre‑fill the field
              self.handleSearch(); // execute the search
            }, 1000);
          }

          //this.$refs.graph.appendChild(VRButton.createButton(renderer));
        })
        .catch((err) => console.warn(err));

      this.resizeObserver.observe(this.$refs.graph);
    },

    updateCounters(graph: { nodes: Node[]; links: Link[] }) {
      this.$refs.nodes.innerText = graph.nodes.length;
      this.$refs.links.innerText = graph.links.length;
    },

    handleResize() {
      if (!Graph) return;
      Graph.width(this.$refs.graph.clientWidth).height(this.$refs.graph.clientHeight);
    },

    handleHover(node?: Node) {
      if (!node) return;

      this.article.content = node;
      this.article.show = true;
    },

    load(id: string) {
      window.open(`https://bildungsportal.sachsen.de/opal/oer/${id}`, "_blank");
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
    <v-layout>
      <v-app-bar density="compact">
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
            </v-list>
          </v-menu>
        </template>
      </v-app-bar>

      <div ref="graph" id="graph"></div>
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

  <v-card class="info-card mx-auto" max-width="344" hover v-show="article.show">
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

        <span v-show="article.content?.authors && article.content?.affiliation">-</span>

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
    </v-card-text>

    <v-card-actions class="pt-0">
      <v-btn
        color="teal-accent-4"
        text="Download"
        variant="text"
        @click="load(article.content?.id)"
      ></v-btn>
    </v-card-actions>
  </v-card>

  <div id="information">
    <h1>OER Graph</h1>
    <span ref="nodes">0</span> Knoten, <span ref="links">0</span> Kanten
  </div>
</template>

<style>
#graph {
  width: 100%;
  height: 100%;
}

.info-card {
  position: absolute !important;
  z-index: 100;
  right: 1rem;
  bottom: 1rem;
  max-height: 60%;
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
</style>
