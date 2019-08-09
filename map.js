const {MapboxLayer, ArcLayer, ScatterplotLayer, IconLayer} = deck;

const COUNTY_DATA_URL = 'https://raw.githubusercontent.com/uber-common/deck.gl-data/master/examples/arc/counties.json';
const NBA_TEAM_DATA_URL = 'https://raw.githubusercontent.com/sp314/sports_map/master/data/nba_teams.json'

// migrate out
const SOURCE_COLOR = [166, 3, 3];
// migrate in
const TARGET_COLOR = [35, 181, 184];
const RADIUS_SCALE = d3.scaleSqrt().domain([0, 8000]).range([1000, 20000]);
const WIDTH_SCALE = d3.scaleLinear().domain([0, 1000]).range([1, 4]);

mapboxgl.accessToken = 'pk.eyJ1Ijoic3BoYW4iLCJhIjoiY2p5eDg4YXc3MHVkdzNsb2J1YXlic3k1bSJ9.ZL4crztm7Wi5c0QVrCpSAQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/sphan/cjz0mghuu1qku1cmht0ftkb22',
  center: [-97.934423, 37.895974],
  pitch: 45,
  zoom: 3.42
});

function rotateCamera(timestamp) {
  // clamp the rotation between 0 -360 degrees
  // Divide timestamp by 100 to slow rotation to ~10 degrees / sec
  map.rotateTo((timestamp / 400) % 360, {duration: 0});
  // Request the next frame of the animation.
  requestAnimationFrame(rotateCamera);
}

// let countiesLayer;
// let arcsLayer;

let teamsLayer;
let matchesLayer;

map.on('load', () => {
  // Start the animation.
  rotateCamera(0);

  // d3.json(COUNTY_DATA_URL).then(function (counties_json) {
  //   counties = loadData(counties_json)
  // });

  d3.json(NBA_TEAM_DATA_URL).then(function(teams_json) {
    loadTeams(teams_json);
  });
});

// map.on('mousemove', ({point}) => {
//   if (arcsLayer) {
//     arcsLayer.setProps({mousePosition: [point.x, point.y]});
//   }
// });

function renderTeams({teams}) {
  const teamsLayer = new MapboxLayer({
    type: IconLayer,
    id: 'nba_teams',
    pickable: true,
    data: teams,
    getIcon: (d) => ({
      url: d.img,
      width: 128,
      height: 128,
      anchorY: 128
    }),
    getSize: 4,
    sizeScale: 16,
    getPosition: d => d.position,
    onHover: (info) => setTooltip(info.object, info.x, info.y)
  });

  map.addLayer(teamsLayer);
}

function loadTeams(data) {
  const teams = [];
  data.features.forEach((team, i) => {
    team.geometry.coordinates.push(0)
    teams.push({
      name: team.properties.team,
      img: team.properties.img,
      position: team.geometry.coordinates
    })
  })

  renderTeams({teams});
}

function setTooltip(object, x, y) {
  const el = document.getElementById('tooltip');
  if (object) {
    el.innerHTML = object.name;
    el.style.display = 'block';
    el.style.color = '#fff';
    el.style.left = x + 30 + 'px';
    el.style.top = y - 30 + 'px';
    el.style.fontFamily = 'San Francisco, sans-serif';
  } else {
    el.style.display = 'none';
  }
}

function loadData(data) {
  const arcs = [];
  const counties = [];
  const pairs = {};
  console.log('data: ', data)

  data.features.forEach((county, i) => {
    const {flows, centroid: targetCentroid} = county.properties;
    const value = {gain: 0, loss: 0};


    Object.keys(flows).forEach((toId) => {
      value[flows[toId] > 0 ? 'gain' : 'loss'] += flows[toId];

      const pairKey = i < toId ? `${i} and ${toId}` : `${toId} and ${i}`;
      const sourceCentroid = data.features[toId].properties.centroid;
      const gain = Math.sign(flows[toId]);

      // eliminate duplicates arcs
      if (pairs[pairKey]) {
        return;
      }

      pairs[pairKey] = true;

      arcs.push({
        target: gain > 0 ? targetCentroid : sourceCentroid,
        source: gain > 0 ? sourceCentroid : targetCentroid,
        value: Math.abs(flows[toId])
      });
    });

    // add point at arc target
    counties.push({
      ...value,
      position: targetCentroid,
      net: value.gain + value.loss,
      total: value.gain - value.loss,
      name: county.properties.name
    });
  });

  // sort counties by radius large -> small
  counties.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  renderLayers({arcs, counties})
  return counties;
}

function renderLayers({arcs, counties}) {
  countiesLayer = new MapboxLayer({
    type: ScatterplotLayer,
    id: 'counties',
    data: counties,
    opacity: 1,
    pickable: true,
    // onHover: this._onHover,
    getRadius: d => RADIUS_SCALE(d.total),
    getFillColor: d => (d.net > 0 ? TARGET_COLOR : SOURCE_COLOR)
  });

  arcsLayer = new MapboxLayer({
    type: ArcBrushingLayer,
    id: 'arcs',
    data: arcs,
    brushRadius: 1000,
    getWidth: d => WIDTH_SCALE(d.value),
    opacity: 1,
    getSourcePosition: d => d.source,
    getTargetPosition: d => d.target,
    getSourceColor: SOURCE_COLOR,
    getTargetColor: TARGET_COLOR
  });

  map.addLayer(countiesLayer, 'waterway-label');
  map.addLayer(arcsLayer);
}

class ArcBrushingLayer extends ArcLayer {
    getShaders() {
      // use customized shaders
      return Object.assign({}, super.getShaders(), {
        inject: {
          'vs:#decl': `
uniform vec2 mousePosition;
uniform float brushRadius;
          `,
          'vs:#main-end': `
float brushRadiusPixels = project_scale(brushRadius);

vec2 sourcePosition = project_position(instancePositions.xy);
bool isSourceInBrush = distance(sourcePosition, mousePosition) <= brushRadiusPixels;

vec2 targetPosition = project_position(instancePositions.zw);
bool isTargetInBrush = distance(targetPosition, mousePosition) <= brushRadiusPixels;

if (!isSourceInBrush && !isTargetInBrush) {
vColor.a = 0.0;
}
          `,
          'fs:#main-start': `
if (vColor.a == 0.0) discard;
          `
        }
      });
    }

    draw(opts) {
      const {brushRadius = 1e6, mousePosition} = this.props;
      // add uniforms
      const uniforms = Object.assign({}, opts.uniforms, {
        brushRadius: brushRadius,
        mousePosition: mousePosition ?
          this.projectPosition(this.unproject(mousePosition)).slice(0, 2) : [0, 0]
      });
      super.draw(Object.assign({}, opts, {uniforms}));
    }
}