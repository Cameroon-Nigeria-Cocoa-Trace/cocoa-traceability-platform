import type { StyleSpecification } from 'maplibre-gl';

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Open Satellite Raster Style (ESRI World Imagery + Carto labels) - No API Key Required
export const OPEN_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, USDA, USGS, AeroGRID, IGN, and the GIS User Community',
    },
    'carto-labels': {
      type: 'raster',
      tiles: [
        'https://cartodb-basemaps-a.global.ssl.fastly.net/light_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'esri-imagery-layer',
      type: 'raster',
      source: 'esri-imagery',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'carto-labels-layer',
      type: 'raster',
      source: 'carto-labels',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// Open Street Map Raster Style - No API Key Required
export const OPEN_STREETS_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'osm-base': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-base-layer',
      type: 'raster',
      source: 'osm-base',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// Open Topo / Terrain Style - No API Key Required
export const OPEN_OUTDOORS_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'opentopo-base': {
      type: 'raster',
      tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    },
  },
  layers: [
    {
      id: 'opentopo-base-layer',
      type: 'raster',
      source: 'opentopo-base',
      minzoom: 0,
      maxzoom: 17,
    },
  ],
};

export function getMapStyle(styleKey: 'satellite' | 'streets' | 'outdoors'): string | StyleSpecification {
  // If user provided a valid Mapbox public token (starts with pk.), load Mapbox styles
  if (MAPBOX_TOKEN && MAPBOX_TOKEN.trim().startsWith('pk.')) {
    if (styleKey === 'streets') return `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${MAPBOX_TOKEN}`;
    if (styleKey === 'outdoors') return `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12?access_token=${MAPBOX_TOKEN}`;
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=${MAPBOX_TOKEN}`;
  }

  // Default to reliable, completely free open raster styles with 0 API keys required
  if (styleKey === 'streets') return OPEN_STREETS_STYLE;
  if (styleKey === 'outdoors') return OPEN_OUTDOORS_STYLE;
  return OPEN_SATELLITE_STYLE;
}
