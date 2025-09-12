import { QueryEngine } from "@comunica/query-sparql";

export class SparqlEngine {
  private engine: QueryEngine;

  constructor() {
    this.engine = new QueryEngine();
  }

  /**
   * Get the correct TTL file URL for the current environment
   */
  private getTTLUrl(): string {
    // Try different possible paths for the TTL file
    const possiblePaths = [
      // Direct file from static folder
      new URL('/oer_dataset.ttl', window.location.origin).href,
      // Static folder path
      new URL('/static/oer_dataset.ttl', window.location.origin).href,
      // Current URL base
      new URL('./oer_dataset.ttl', window.location.href).href,
      // Relative to current page
      new URL('../oer_dataset.ttl', window.location.href).href,
    ];
    
    // For development, use the most likely path
    return possiblePaths[0];
  }

  /**
   * Test if a TTL file URL is accessible
   */
  async testTTLAccess(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find accessible TTL file URL
   */
  async findAccessibleTTLUrl(): Promise<string> {
    const possiblePaths = [
      new URL('/oer_dataset.ttl', window.location.origin).href,
      new URL('/static/oer_dataset.ttl', window.location.origin).href,
      new URL('./oer_dataset.ttl', window.location.href).href,
      new URL('../oer_dataset.ttl', window.location.href).href,
      // Also try without leading slash
      new URL('oer_dataset.ttl', window.location.origin).href,
    ];

    for (const path of possiblePaths) {
      console.log(`Testing TTL path: ${path}`);
      if (await this.testTTLAccess(path)) {
        console.log(`✓ Found accessible TTL file at: ${path}`);
        return path;
      }
    }

    throw new Error(`TTL file not found at any of these paths: ${possiblePaths.join(', ')}`);
  }

  /**
   * Execute a SPARQL SELECT query against the OER dataset
   * @param query SPARQL query string
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   * @returns Promise resolving to an array of bindings
   */
  async executeSelectQuery(query: string, ttlUrl?: string) {
    try {
      // If no URL provided, try to find the TTL file
      const sourceUrl = ttlUrl || await this.findAccessibleTTLUrl();
      
      console.log(`Executing SPARQL query against: ${sourceUrl}`);
      
      const bindingsStream = await this.engine.queryBindings(query, {
        sources: [sourceUrl],
      });

      // Convert stream to array for easier handling
      const bindings = await bindingsStream.toArray();

      // Convert RDF/JS bindings to plain objects
      return bindings.map((binding) => {
        const result: Record<string, any> = {};
        for (const [variable, term] of binding) {
          result[variable.value] = {
            value: term.value,
            type: term.termType,
            datatype: (term as any).datatype?.value,
            language: (term as any).language,
          };
        }
        return result;
      });
    } catch (error) {
      console.error("SPARQL query execution failed:", error);
      throw error;
    }
  }

  /**
   * Execute a SPARQL CONSTRUCT query to get RDF triples
   * @param query SPARQL CONSTRUCT query string
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   * @returns Promise resolving to an array of quads
   */
  async executeConstructQuery(query: string, ttlUrl?: string) {
    try {
      const sourceUrl = ttlUrl || await this.findAccessibleTTLUrl();
      
      const quadStream = await this.engine.queryQuads(query, {
        sources: [sourceUrl],
      });

      const quads = await quadStream.toArray();

      return quads.map((quad) => ({
        subject: quad.subject.value,
        predicate: quad.predicate.value,
        object: quad.object.value,
        graph: quad.graph.value,
      }));
    } catch (error) {
      console.error("SPARQL CONSTRUCT query execution failed:", error);
      throw error;
    }
  }

  /**
   * Get all learning resources with their basic information
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   * @param limit Optional limit for results
   */
  async getLearningResources(ttlUrl?: string, limit = 100) {
    const query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX edu: <http://example.org/education/>
      PREFIX oer: <http://example.org/oer/>

      SELECT ?resource ?title ?creator ?type ?format ?subject WHERE {
        ?resource a edu:LearningResource ;
                  dcterms:title ?title ;
                  dcterms:creator ?creator ;
                  dcterms:type ?type ;
                  dcterms:format ?format .
        OPTIONAL { ?resource dcterms:subject ?subject }
      } LIMIT ${limit}
    `;

    return this.executeSelectQuery(query, ttlUrl);
  }

  /**
   * Search learning resources by subject/concept
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   * @param concept The concept to search for (e.g., "Datenbanken")
   */
  async searchBySubject(ttlUrl: string | undefined, concept: string) {
    const query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX edu: <http://example.org/education/>
      PREFIX oer: <http://example.org/oer/>

      SELECT ?resource ?title ?creator ?type ?subject WHERE {
        ?resource a edu:LearningResource ;
                  dcterms:title ?title ;
                  dcterms:creator ?creator ;
                  dcterms:type ?type ;
                  dcterms:subject ?subject .
        FILTER(CONTAINS(LCASE(STR(?subject)), LCASE("${concept}")))
      }
    `;

    return this.executeSelectQuery(query, ttlUrl);
  }

  /**
   * Get resources by creator/author
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   * @param creator The creator name to search for
   */
  async getResourcesByCreator(ttlUrl: string | undefined, creator: string) {
    const query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX edu: <http://example.org/education/>
      PREFIX oer: <http://example.org/oer/>

      SELECT ?resource ?title ?type ?format ?subject WHERE {
        ?resource a edu:LearningResource ;
                  dcterms:title ?title ;
                  dcterms:creator ?creator ;
                  dcterms:type ?type ;
                  dcterms:format ?format .
        OPTIONAL { ?resource dcterms:subject ?subject }
        FILTER(CONTAINS(LCASE(STR(?creator)), LCASE("${creator}")))
      }
    `;

    return this.executeSelectQuery(query, ttlUrl);
  }

  /**
   * Get all unique subjects/concepts in the dataset
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   */
  async getAllSubjects(ttlUrl?: string) {
    const query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX edu: <http://example.org/education/>

      SELECT DISTINCT ?subject WHERE {
        ?resource a edu:LearningResource ;
                  dcterms:subject ?subject .
      }
      ORDER BY ?subject
    `;

    return this.executeSelectQuery(query, ttlUrl);
  }

  /**
   * Get statistics about the dataset
   * @param ttlUrl URL to the TTL file (optional, will auto-detect if not provided)
   */
  async getDatasetStats(ttlUrl?: string) {
    const query = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX edu: <http://example.org/education/>

      SELECT 
        (COUNT(DISTINCT ?resource) as ?totalResources)
        (COUNT(DISTINCT ?creator) as ?totalCreators)
        (COUNT(DISTINCT ?type) as ?totalTypes)
        (COUNT(DISTINCT ?subject) as ?totalSubjects)
      WHERE {
        ?resource a edu:LearningResource .
        OPTIONAL { ?resource dcterms:creator ?creator }
        OPTIONAL { ?resource dcterms:type ?type }
        OPTIONAL { ?resource dcterms:subject ?subject }
      }
    `;

    return this.executeSelectQuery(query, ttlUrl);
  }

  /**
   * Test TTL file accessibility and log debug information
   */
  async testTTLFileAccess() {
    const possiblePaths = [
      new URL('/oer_dataset.ttl', window.location.origin).href,
      new URL('/static/oer_dataset.ttl', window.location.origin).href,
      new URL('./oer_dataset.ttl', window.location.href).href,
      new URL('../oer_dataset.ttl', window.location.href).href,
      new URL('oer_dataset.ttl', window.location.origin).href,
    ];

    console.log('Current location:', window.location.href);
    console.log('Testing TTL file accessibility...');

    const results: Array<{
      path: string;
      accessible: boolean;
      status?: number;
      statusText?: string;
      error?: string;
    }> = [];
    
    for (const path of possiblePaths) {
      try {
        const response = await fetch(path, { method: 'HEAD' });
        const accessible = response.ok;
        console.log(`${accessible ? '✓' : '✗'} ${path} - ${response.status} ${response.statusText}`);
        results.push({ path, accessible, status: response.status, statusText: response.statusText });
      } catch (error) {
        console.log(`✗ ${path} - Error: ${error}`);
        results.push({ path, accessible: false, error: error?.toString() });
      }
    }

    return results;
  }
}

// Export a singleton instance
export const sparqlEngine = new SparqlEngine();
