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
  }))
}

function showNodeInfo(node) {
  if (!node) {
    return
  }

  let affiliation = ''
  let file = ''

  if (node.affiliation) {
    affiliation = `<i style="display: block; margin-top: 0.5rem">(${node.affiliation})</i>`
  }

  if (node.file) {
    file = '<br>Typ: ' + node.file
  }

  const infoDiv = document.getElementById('node-info-text')

  if (!infoDiv) return

  infoDiv.parentElement.style.display = 'block'
  infoDiv.innerHTML = `
        <strong>${node.title}</strong>
        ${affiliation}
        <ul>
          ${(node.tag || []).map((tag) => `<li>${tag}</li>`).join('')}
        </ul>
        <a href="https://bildungsportal.sachsen.de/opal/oer/${
          node.id
        }" target="_blank" style="color:#6cf;text-decoration:underline; margin-bottom: 0.5rem">
          Zum OER-Eintrag
        </a>
        ${file}
        `
}

function includes(base: string, term: string) {
  base = base.toLowerCase()
  let terms = term.toLowerCase().split(' ')

  for (let t of terms) {
    if (!base.includes(t)) return false
  }

  return true
}

function handleSearch(e) {
  const term = e.target.value.toLowerCase()
  if (!database || !Graph) return

  if (!term) {
    Graph.graphData(database).d3ReheatSimulation()
    updateCounters(database)
    return
  }

  // find all matching node IDs
  const termIds = new Set(
    database.nodes
      .filter((n) => {
        return includes(
          n.title + ' ' + n.affiliation + ' ' + n.file + n.tag.join(' '),
          term
        )
      })
      .map((n) => n.id)
  )

  // filter links by any endpoint matching, **then** re-map to id-only links
  const links = database.links
    .filter((l) => termIds.has(l.source.id) || termIds.has(l.target.id))
    .map((l) => ({
      source: l.source.id,
      target: l.target.id,
    }))

  // rebuild nodes (clearing positions so they re-pack)
  const nodes = resetNodePositions(
    database.nodes.filter(
      (n) =>
        termIds.has(n.id) ||
        links.some((l) => l.source === n.id || l.target === n.id)
    )
  )

  // hand the cleaned data back to the graph
  Graph.graphData({ nodes, links })
    .cooldownTicks(100)
    .d3ReheatSimulation()
    .zoomToFit(600, 40)

  updateCounters({ nodes, links })
}

function updateCounters(graph) {
  document.getElementById('nodes').innerText = graph.nodes.length
  document.getElementById('edges').innerText = graph.links.length
}

const elem = document.getElementById('3d-graph')
let database = null
let Graph = null

fetch('db.json')
  .then((response) => response.json())
  .then((json) => {
    database = json
    updateCounters(database)
    Graph = new ForceGraph3D(elem)
      .graphData(database)
      .nodeAutoColorBy((node) => node.tag[0])
      .nodeLabel((node) => `${node.title}`)
      .onNodeClick((node) =>
        window.open(
          `https://bildungsportal.sachsen.de/opal/oer/${node.id}`,
          '_blank'
        )
      )
      .onNodeHover(showNodeInfo)
      .onNodeRightClick(showNodeInfo)
  })
  .catch((err) => {
    console.warn(err)
  })

const debounce = (fn, ms = 200) => {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

document
  .getElementById('search-input')
  ?.addEventListener('input', debounce(handleSearch, 250))

document.getElementById('close-node-info').onclick = function () {
  document.getElementById('node-info').style.display = 'none'
}
