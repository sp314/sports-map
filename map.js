const {MapboxLayer, ArcLayer, ScatterplotLayer, IconLayer} = deck;
const NBA_TEAM_DATA_URL = 'https://raw.githubusercontent.com/sp314/sports_map/master/data/nba_teams.geojson'
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
let teamsLayer;
let matchesLayer;

map.on('load', () => {
  // Start the animation.
  rotateCamera(0);
  d3.json(NBA_TEAM_DATA_URL).then(function(teams_json) {
    loadTeams(teams_json);
  });
});

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