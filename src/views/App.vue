<script lang="ts">
import { VRButton } from "../../node_modules/three/examples/jsm/webxr/VRButton.js";
import ForceGraph3D from "3d-force-graph";

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

      if (!database || !Graph) return;

      const term = this.search.text.trim().toLowerCase();

      // 1️⃣  Show the entire graph **only** when the search term is exactly '*'
      if (term === "*") {
        Graph.graphData(database).d3ReheatSimulation();
        //updateCounters(database)
        return;
      }

      // 2️⃣  Hide the graph completely when the search field is empty
      if (!term) {
        Graph.graphData({ nodes: [], links: [] });
        //updateCounters({ nodes: [], links: [] })
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

      //updateCounters({ nodes, links })

      this.search.loading = false;
    },

    initGraph() {
      if (Graph) return;

      fetch("db.json")
        .then((response) => response.json())
        .then((json) => {
          // Start with an **empty** graph until the user types '*'
          //updateCounters({ nodes: [], links: [] });

          database = json;

          Graph = new ForceGraph3D(this.$refs.graph)
            .graphData({ nodes: [], links: [] })
            .nodeAutoColorBy((node) => node.tag[0])
            .nodeLabel((node) => `${node.title}`)
            .onNodeClick((node) =>
              window.open(
                `https://bildungsportal.sachsen.de/opal/oer/${node.id}`,
                "_blank"
              )
            )
            .onNodeHover(this.handleHover);
          //.onNodeRightClick(showNodeInfo);

          //this.handleSearch();

          // Enable WebXR
          const renderer = Graph.renderer();
          renderer.xr.enabled = true;

          //this.$refs.graph.appendChild(VRButton.createButton(renderer));
        })
        .catch((err) => console.warn(err));

      this.resizeObserver.observe(this.$refs.graph);
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

        <v-app-bar-title>OER-Graph</v-app-bar-title>
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
    <v-card-item>
      <v-card-title>
        {{ article.content?.title }}
      </v-card-title>

      <v-card-subtitle>
        {{ article.content?.authors }}

        <span v-show="article.content?.affiliation">
          - (<i>
            {{ article.content?.affiliation }}
          </i>

          )
        </span>
      </v-card-subtitle>
    </v-card-item>

    <v-card-text>
      {{ article.content?.summary }}
    </v-card-text>

    <v-card-actions class="pt-0">
      <v-btn
        color="teal-accent-4"
        text="Close"
        variant="text"
        @click="article.show = false"
      ></v-btn>
    </v-card-actions>
  </v-card>

  <!--v-dialog width="auto">
    <v-card
      max-width="400"
      prepend-icon="mdi-information-outline"
      :title="article.content?.title"
    >
      <template v-slot:actions>
        <v-btn class="ms-auto" text="Ok" @click="article.show = false"></v-btn>
      </template>

      <v-card-text>
        Diese Karte zeigt das <i>Netzwerk</i> aller OER-Inhalte des sächsischen
        OPAL-Systems. Jeder <i>Knoten</i> stellt einen OER-Inhalt dar und jede Kante eine
        Ähnlichkeitsbeziehung zwischen den Beiträgen.
      </v-card-text>
    </v-card>
  </v-dialog-->
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
</style>
