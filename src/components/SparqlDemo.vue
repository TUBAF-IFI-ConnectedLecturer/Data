<template>
  <v-container>
    <v-card class="pa-4">
      <v-card-title>SPARQL Query Interface</v-card-title>
      
      <v-row>
        <v-col cols="12" md="6">
          <v-select
            v-model="selectedQuery"
            :items="predefinedQueries"
            item-title="name"
            item-value="query"
            label="Predefined Queries"
            @update:model-value="onQuerySelect"
          />
          
          <v-textarea
            v-model="sparqlQuery"
            label="SPARQL Query"
            rows="8"
            variant="outlined"
            class="mt-3"
          />
          
          <v-btn 
            @click="executeQuery" 
            color="primary" 
            :loading="loading"
            class="mt-2"
          >
            Execute Query
          </v-btn>
          
          <v-btn 
            @click="loadBasicData" 
            color="secondary" 
            :loading="loading"
            class="mt-2 ml-2"
          >
            Load Sample Data
          </v-btn>
          
          <v-btn 
            @click="testFileAccess" 
            color="warning" 
            :loading="loading"
            class="mt-2 ml-2"
          >
            Test File Access
          </v-btn>
        </v-col>
        
        <v-col cols="12" md="6">
          <v-card variant="outlined" class="pa-3">
            <v-card-title>Results ({{ results.length }} items)</v-card-title>
            
            <v-progress-linear 
              v-if="loading" 
              indeterminate 
              color="primary"
            />
            
            <div v-if="error" class="error-message pa-2">
              <v-alert type="error">{{ error }}</v-alert>
            </div>
            
            <div v-if="results.length > 0" class="results-container">
              <v-virtual-scroll
                :items="results"
                height="400"
                item-height="60"
              >
                <template v-slot:default="{ item }">
                  <v-list-item>
                    <v-list-item-title>
                      {{ getDisplayValue(item) }}
                    </v-list-item-title>
                    <v-list-item-subtitle>
                      {{ getSubtitleValue(item) }}
                    </v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-virtual-scroll>
            </div>
            
            <div v-if="!loading && results.length === 0 && !error" class="pa-2">
              <v-alert type="info">No results found. Try executing a query.</v-alert>
            </div>
          </v-card>
        </v-col>
      </v-row>
      
      <v-row v-if="stats" class="mt-4">
        <v-col cols="12">
          <v-card variant="outlined" class="pa-3">
            <v-card-title>Dataset Statistics</v-card-title>
            <v-row>
              <v-col cols="3">
                <v-card class="text-center pa-2">
                  <div class="text-h4 primary--text">{{ stats.totalResources }}</div>
                  <div class="text-caption">Learning Resources</div>
                </v-card>
              </v-col>
              <v-col cols="3">
                <v-card class="text-center pa-2">
                  <div class="text-h4 secondary--text">{{ stats.totalCreators }}</div>
                  <div class="text-caption">Creators</div>
                </v-card>
              </v-col>
              <v-col cols="3">
                <v-card class="text-center pa-2">
                  <div class="text-h4 accent--text">{{ stats.totalTypes }}</div>
                  <div class="text-caption">Resource Types</div>
                </v-card>
              </v-col>
              <v-col cols="3">
                <v-card class="text-center pa-2">
                  <div class="text-h4 info--text">{{ stats.totalSubjects }}</div>
                  <div class="text-caption">Subjects</div>
                </v-card>
              </v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { sparqlEngine } from '../utils/sparqlEngine';

const sparqlQuery = ref('');
const selectedQuery = ref('');
const results = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const stats = ref<any>(null);

// We'll auto-detect the TTL file URL now
// const TTL_URL = '/oer_dataset.ttl';

const predefinedQueries = [
  {
    name: 'Get 10 Learning Resources',
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?type WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:type ?type .
} LIMIT 10`
  },
  {
    name: 'Search by Subject (Datenbanken)',
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?creator ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:creator ?creator ;
            dcterms:subject ?subject .
  FILTER(CONTAINS(LCASE(STR(?subject)), "datenbanken"))
} LIMIT 20`
  },
  {
    name: 'Get All Unique Subjects',
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT DISTINCT ?subject WHERE {
  ?resource a edu:LearningResource ;
            dcterms:subject ?subject .
} ORDER BY ?subject LIMIT 50`
  },
  {
    name: 'Resources by Format',
    query: `PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX edu: <http://example.org/education/>

SELECT ?resource ?title ?format WHERE {
  ?resource a edu:LearningResource ;
            dcterms:title ?title ;
            dcterms:format ?format .
  FILTER(?format = "pdf")
} LIMIT 15`
  }
];

const onQuerySelect = (query: string) => {
  sparqlQuery.value = query;
};

const executeQuery = async () => {
  if (!sparqlQuery.value.trim()) {
    error.value = 'Please enter a SPARQL query';
    return;
  }

  loading.value = true;
  error.value = '';
  results.value = [];

  try {
    const queryResults = await sparqlEngine.executeSelectQuery(sparqlQuery.value);
    results.value = queryResults;
    console.log('Query results:', queryResults);
  } catch (err) {
    error.value = `Query execution failed: ${err}`;
    console.error('SPARQL query error:', err);
  } finally {
    loading.value = false;
  }
};

const loadBasicData = async () => {
  loading.value = true;
  error.value = '';

  try {
    // Load some basic learning resources
    const resources = await sparqlEngine.getLearningResources(undefined, 20);
    results.value = resources;
    
    // Load dataset statistics
    const statsResult = await sparqlEngine.getDatasetStats();
    if (statsResult.length > 0) {
      const statRow = statsResult[0];
      stats.value = {
        totalResources: statRow.totalResources?.value || 0,
        totalCreators: statRow.totalCreators?.value || 0,
        totalTypes: statRow.totalTypes?.value || 0,
        totalSubjects: statRow.totalSubjects?.value || 0
      };
    }
    
    console.log('Basic data loaded:', resources);
    console.log('Statistics:', stats.value);
  } catch (err) {
    error.value = `Failed to load basic data: ${err}`;
    console.error('Data loading error:', err);
  } finally {
    loading.value = false;
  }
};

const testFileAccess = async () => {
  loading.value = true;
  error.value = '';
  
  try {
    const testResults = await sparqlEngine.testTTLFileAccess();
    results.value = testResults.map(result => ({
      path: { value: result.path },
      accessible: { value: result.accessible.toString() },
      status: { value: result.status?.toString() || 'N/A' },
      statusText: { value: result.statusText || result.error || 'N/A' }
    }));
    console.log('File access test results:', testResults);
  } catch (err) {
    error.value = `File access test failed: ${err}`;
    console.error('File access test error:', err);
  } finally {
    loading.value = false;
  }
};

const getDisplayValue = (item: any) => {
  // Try to get title first, then resource, then any meaningful value
  if (item.title) return item.title.value;
  if (item.resource) return item.resource.value.split('/').pop();
  if (item.subject) return item.subject.value.split('/').pop();
  
  // Return first available value
  const keys = Object.keys(item);
  if (keys.length > 0) {
    return item[keys[0]]?.value || 'N/A';
  }
  return 'N/A';
};

const getSubtitleValue = (item: any) => {
  // Try to show creator, type, or format as subtitle
  if (item.creator) return `Creator: ${item.creator.value.split('/').pop()}`;
  if (item.type) return `Type: ${item.type.value.split('/').pop()}`;
  if (item.format) return `Format: ${item.format.value}`;
  
  // Show variable count as fallback
  const keyCount = Object.keys(item).length;
  return `${keyCount} properties`;
};

onMounted(() => {
  // Set a default query
  sparqlQuery.value = predefinedQueries[0].query;
});
</script>

<style scoped>
.results-container {
  max-height: 400px;
  overflow-y: auto;
}

.error-message {
  background-color: #ffebee;
  border-radius: 4px;
}
</style>
