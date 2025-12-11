<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    fullscreen
  >
    <v-card>
      <v-toolbar dark color="primary">
        <v-btn icon @click="closeModal">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title>SPARQL Query Interface - Filter OER Graph</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          color="accent"
          variant="outlined"
          @click="clearFilters"
          :disabled="!hasActiveFilters"
        >
          Clear Filters
        </v-btn>
      </v-toolbar>

      <v-container fluid class="pa-4">
        <v-row>
          <!-- Left Panel - Query Interface -->
          <v-col cols="12" lg="4">
            <v-card elevation="2" class="pa-4">
              <v-card-title class="pb-2">Query Builder</v-card-title>

              <!-- Predefined Query Selector -->
              <v-select
                v-model="selectedQuery"
                :items="predefinedQueries"
                item-title="name"
                item-value="value"
                label="Quick Filters"
                variant="outlined"
                density="compact"
                @update:model-value="onQuerySelect"
                class="mb-3"
              />

              <!-- Custom SPARQL Query -->
              <v-textarea
                v-model="sparqlQuery"
                label="Custom SPARQL Query"
                rows="8"
                variant="outlined"
                density="compact"
                class="mb-3"
              />

              <!-- Action Buttons -->
              <div class="d-flex gap-2 mb-3">
                <v-btn @click="executeQuery" color="primary" :loading="loading" block>
                  Apply Filter
                </v-btn>
              </div>

              <!-- Filter Status -->
              <v-card
                v-if="lastQuery"
                variant="outlined"
                class="pa-3 mb-3"
                color="success"
              >
                <v-card-text class="pa-0">
                  <strong>Active Filter:</strong><br />
                  <small>{{ getQueryDescription(lastQuery) }}</small>
                </v-card-text>
              </v-card>

              <!-- Error Display -->
              <v-alert v-if="error" type="error" variant="outlined" class="mb-3">
                {{ error }}
              </v-alert>

              <!-- Statistics -->
              <v-card v-if="stats" variant="outlined" class="pa-3">
                <v-card-title class="pa-0 pb-2 text-subtitle-1"
                  >Dataset Statistics</v-card-title
                >
                <v-row dense>
                  <v-col cols="6">
                    <div class="text-center">
                      <div class="text-h6 primary--text">{{ stats.totalResources }}</div>
                      <div class="text-caption">Resources</div>
                    </div>
                  </v-col>
                  <v-col cols="6">
                    <div class="text-center">
                      <div class="text-h6 secondary--text">{{ filteredCount }}</div>
                      <div class="text-caption">Filtered</div>
                    </div>
                  </v-col>
                </v-row>
              </v-card>
            </v-card>
          </v-col>

          <!-- Right Panel - Results -->
          <v-col cols="12" lg="8">
            <v-card elevation="2" class="pa-4" style="height: calc(100vh - 120px)">
              <v-card-title class="pb-2">
                Query Results
                <span v-if="results.length > 0" class="text-caption ml-2">
                  ({{ results.length }} items)
                </span>
              </v-card-title>

              <v-progress-linear
                v-if="loading"
                indeterminate
                color="primary"
                class="mb-3"
              />

              <!-- Results List -->
              <div
                v-if="results.length > 0"
                style="height: calc(100vh - 200px); overflow-y: auto"
              >
                <v-virtual-scroll :items="results" height="100%" item-height="120">
                  <template v-slot:default="{ item, index }">
                    <v-card
                      class="ma-2"
                      variant="outlined"
                      :color="getItemColor(item)"
                      @click="selectItem(item)"
                      hover
                    >
                      <v-card-item>
                        <v-card-title class="text-subtitle-1">
                          {{ getDisplayTitle(item) }}
                        </v-card-title>
                        <v-card-subtitle>
                          {{ getDisplaySubtitle(item) }}
                        </v-card-subtitle>
                      </v-card-item>
                      <v-card-text class="pt-0">
                        <div class="text-body-2">
                          {{ getDisplayContent(item) }}
                        </div>
                        <v-chip-group class="mt-2" column>
                          <v-chip
                            v-for="(value, key) in getDisplayProperties(item)"
                            :key="key"
                            size="small"
                            variant="outlined"
                          >
                            {{ key }}: {{ value }}
                          </v-chip>
                        </v-chip-group>
                      </v-card-text>
                    </v-card>
                  </template>
                </v-virtual-scroll>
              </div>

              <!-- Empty State -->
              <div v-else-if="!loading" class="text-center pa-8">
                <v-icon size="64" color="grey">mdi-database-search</v-icon>
                <div class="text-h6 mt-4 text-grey">No results found</div>
                <div class="text-body-2 text-grey">
                  Try selecting a predefined filter or write a custom SPARQL query
                </div>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-container>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { sparqlEngine } from "../utils/sparqlEngine";

// Props and Emits
const props = defineProps<{
  modelValue: boolean;
  darkMode?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "filter-applied": [data: any[]];
  "item-selected": [item: any];
  "filters-cleared": [];
}>();

// Reactive data
const sparqlQuery = ref("");
const selectedQuery = ref("");
const results = ref<any[]>([]);
const loading = ref(false);
const error = ref("");
const stats = ref<any>(null);
const lastQuery = ref("");

// Predefined queries for graph filtering
const predefinedQueries = [
  {
    name: "All Learning Resources",
    value: "all",
    description: "Show all learning resources",
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?format ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:type ?type ;
            dcterms:format ?format .
  OPTIONAL { ?resource dcterms:subject ?subject }
} LIMIT 100`,
  },
  {
    name: "Database & SQL Resources",
    value: "databases",
    description: "Resources about databases and SQL",
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:type ?type ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "datenbank") || 
         CONTAINS(LCASE(STR(?subject)), "sql") ||
         CONTAINS(LCASE(STR(?title)), "datenbank") ||
         CONTAINS(LCASE(STR(?title)), "sql"))
}`,
  },
  {
    name: "Programming & Informatik",
    value: "programming",
    description: "Programming and computer science resources",
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:type ?type ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "informatik") || 
         CONTAINS(LCASE(STR(?subject)), "programming") ||
         CONTAINS(LCASE(STR(?subject)), "programmierung"))
}`,
  },
  {
    name: "Mathematics Resources",
    value: "mathematics",
    description: "Mathematical learning resources",
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:type ?type ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "mathematik") || 
         CONTAINS(LCASE(STR(?subject)), "mathe") ||
         CONTAINS(LCASE(STR(?title)), "mathematik"))
}`,
  },
  {
    name: "PDF Documents",
    value: "pdf",
    description: "Resources in PDF format",
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type ?format WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:type ?type ;
            dcterms:format ?format .
  FILTER(?format = "pdf" || ?format = "application/pdf")
} LIMIT 50`,
  },
];

// Computed properties
const hasActiveFilters = computed(() => !!lastQuery.value);
const filteredCount = computed(() => results.value.length);

// Methods
const closeModal = () => {
  emit("update:modelValue", false);
};

const onQuerySelect = (value: string) => {
  const selected = predefinedQueries.find((q) => q.value === value);
  if (selected) {
    sparqlQuery.value = selected.query;
  }
};

const executeQuery = async () => {
  if (!sparqlQuery.value.trim()) {
    error.value = "Please enter a SPARQL query or select a predefined filter";
    return;
  }

  loading.value = true;
  error.value = "";
  results.value = [];

  try {
    const queryResults = await sparqlEngine.executeSelectQuery(sparqlQuery.value);
    results.value = queryResults;
    lastQuery.value = selectedQuery.value || "custom";

    // Convert SPARQL results to graph node format and emit
    const graphData = convertSparqlToGraphData(queryResults);
    emit("filter-applied", graphData);

    console.log("Query results:", queryResults);
  } catch (err: any) {
    error.value = `Query execution failed: ${err.message || err}`;
    console.error("SPARQL query error:", err);
  } finally {
    loading.value = false;
  }
};

const clearFilters = () => {
  results.value = [];
  lastQuery.value = "";
  selectedQuery.value = "";
  sparqlQuery.value = "";
  error.value = "";
  emit("filters-cleared");
};

const selectItem = (item: any) => {
  emit("item-selected", item);
};

// Convert SPARQL results to graph node format
const convertSparqlToGraphData = (sparqlResults: any[]) => {
  return sparqlResults.map((result) => {
    const resourceId = result.resource?.value?.split("/").pop() || "";

    return {
      id: resourceId,
      title: result.title?.value || "Untitled",
      type: result.type?.value?.split("/").pop() || "Unknown",
      file: result.format?.value || "unknown",
      affiliation: result.creator?.value?.split("/").pop() || "",
      summary: result.description?.value || "",
      authors: result.creator?.value?.split("/").pop() || "",
      tag: result.subject?.value ? [result.subject.value.split("/").pop()] : ["Unknown"],
      // Add SPARQL-specific data
      sparqlData: result,
    };
  });
};

// Display helper methods
const getDisplayTitle = (item: any) => {
  return item.title?.value || item.resource?.value?.split("/").pop() || "Untitled";
};

const getDisplaySubtitle = (item: any) => {
  return (
    item.creator?.value?.split("/").pop() ||
    item.type?.value?.split("/").pop() ||
    "Unknown"
  );
};

const getDisplayContent = (item: any) => {
  return (
    item.description?.value ||
    item.summary?.value ||
    item.subject?.value?.split("/").pop() ||
    "No description available"
  );
};

const getDisplayProperties = (item: any) => {
  const props: Record<string, string> = {};

  if (item.type?.value) {
    props.Type = item.type.value.split("/").pop();
  }
  if (item.format?.value) {
    props.Format = item.format.value;
  }
  if (item.subject?.value) {
    props.Subject = item.subject.value.split("/").pop();
  }

  return props;
};

const getItemColor = (item: any) => {
  // Color code based on type or subject
  const subject = item.subject?.value?.toLowerCase() || "";
  const type = item.type?.value?.toLowerCase() || "";
  const isDark = props.darkMode ?? true;

  if (subject.includes("informatik") || subject.includes("programming")) {
    return isDark ? "blue-darken-3" : "blue-lighten-5";
  } else if (subject.includes("mathematik") || subject.includes("mathe")) {
    return isDark ? "green-darken-3" : "green-lighten-5";
  } else if (subject.includes("datenbank") || subject.includes("sql")) {
    return isDark ? "purple-darken-3" : "purple-lighten-5";
  } else if (type.includes("tutorial")) {
    return isDark ? "orange-darken-3" : "orange-lighten-5";
  }
  return isDark ? "grey-darken-3" : "grey-lighten-4";
};

const getQueryDescription = (queryKey: string) => {
  const query = predefinedQueries.find((q) => q.value === queryKey);
  return query?.description || "Custom SPARQL query";
};

// Load dataset statistics on mount
onMounted(async () => {
  try {
    const statsResult = await sparqlEngine.getDatasetStats();
    if (statsResult.length > 0) {
      const statRow = statsResult[0];
      stats.value = {
        totalResources: statRow.totalResources?.value || 0,
        totalCreators: statRow.totalCreators?.value || 0,
        totalTypes: statRow.totalTypes?.value || 0,
        totalSubjects: statRow.totalSubjects?.value || 0,
      };
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
});
</script>

<style scoped>
.gap-2 {
  gap: 8px;
}
</style>
