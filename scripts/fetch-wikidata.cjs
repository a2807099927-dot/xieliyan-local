const fs = require('fs');
const https = require('https');
const path = require('path');

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_DIR = 'e:\\梨眼\\tauri2\\地图素材\\historical-data\\wikidata';

const queries = {
  'china_cities.json': "SELECT ?item ?itemLabel ?coord ?startYear ?endYear WHERE { ?item wdt:P17 wd:Q29520 . ?item wdt:P31/wdt:P279* wd:Q515 . ?item wdt:P625 ?coord . OPTIONAL { ?item wdt:P580 ?start . BIND(YEAR(?start) AS ?startYear) } OPTIONAL { ?item wdt:P582 ?end . BIND(YEAR(?end) AS ?endYear) } SERVICE wikibase:label { bd:serviceParam wikibase:language \"zh,en\" . } } LIMIT 5000",
  'china_battles.json': "SELECT ?item ?itemLabel ?coord ?date ?itemDescription WHERE { ?item wdt:P31/wdt:P279* wd:Q178561 . ?item wdt:P17 wd:Q29520 . ?item wdt:P625 ?coord . OPTIONAL { ?item wdt:P585 ?date . } SERVICE wikibase:label { bd:serviceParam wikibase:language \"zh,en\" . } } LIMIT 2000",
  'china_states.json': "SELECT ?item ?itemLabel ?coord ?start ?end ?capitalLabel WHERE { ?item wdt:P31/wdt:P279* wd:Q3624078 . ?item wdt:P17 wd:Q29520 . OPTIONAL { ?item wdt:P625 ?coord . } OPTIONAL { ?item wdt:P580 ?start . } OPTIONAL { ?item wdt:P582 ?end . } OPTIONAL { ?item wdt:P36 ?capital . } SERVICE wikibase:label { bd:serviceParam wikibase:language \"zh,en\" . } } LIMIT 1000"
};

async function fetchWikidata(filename, query) {
  return new Promise((resolve, reject) => {
    const url = WIKIDATA_ENDPOINT + '?query=' + encodeURIComponent(query);
    const req = https.get(url, {
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'TauriMapTool/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.error("Failed to fetch " + filename + ": " + res.statusCode);
          resolve();
          return;
        }
        fs.writeFileSync(path.join(WIKIDATA_DIR, filename), data, 'utf8');
        console.log("Saved " + filename);
        resolve();
      });
    });
    req.on('error', reject);
  });
}

async function run() {
  for (const [filename, query] of Object.entries(queries)) {
    console.log("Fetching " + filename + "...");
    await fetchWikidata(filename, query);
  }
}

run().catch(console.error);
