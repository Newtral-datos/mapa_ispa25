document.addEventListener("DOMContentLoaded", function() {
  // Registrar el protocolo PMTiles
  let protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  // Inicializar el mapa con MapLibre y mapa base GRIS (CartoDB Positron)
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'carto-light': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors, © CARTO'
        }
      },
      layers: [
        {
          id: 'carto-light',
          type: 'raster',
          source: 'carto-light',
          minzoom: 0,
          maxzoom: 22
        }
      ]
    },
    center: [-3.7038, 40.4168],
    zoom: 5
  });

  // Añadir controles de navegación
  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  const POLYGON_LAYER_ID = 'geodata_ispa25_fill';

  map.on('load', function() {
    // Cargar datos desde PMTiles local
    map.addSource('geodata_ispa25', {
      type: 'vector',
      url: 'pmtiles://./geodata_ispa25.pmtiles'
    });

    function formatPopulation(value) {
      const digits = String(value).replace(/\D/g, '');
      if (!digits) return value;
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function getTotalRange() {
      const features = map.querySourceFeatures('geodata_ispa25', { sourceLayer: 'geodata_ispa25' });
      let min = Infinity;
      let max = -Infinity;
      for (const f of features) {
        const v = Number(f.properties.TOTAL);
        if (!isNaN(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (!isFinite(min) || !isFinite(max)) {
        min = 0;
        max = 1;
      }
      return { min, max };
    }

    const range = getTotalRange();
    const minTotal = range.min;
    const maxTotal = range.max;
    const span = maxTotal - minTotal || 1;

    const fillColorExpr = [
      'case',
      ['==', ['get', 'TOTAL_TXT'], 'No han remitido información al ISPA'],
      '#d8d8d8',
      [
        'interpolate',
        ['linear'],
        ['to-number', ['get', 'TOTAL']],
        0,      '#D2F7EC',
        10000,  '#A3F2DA',
        20000,  '#7CECC7',
        40000,  '#01f3b3',
        60000,  '#00A983',
        80000,  '#006C50'
      ]
    ];    

    map.addLayer({
      id: POLYGON_LAYER_ID,
      type: 'fill',
      source: 'geodata_ispa25',
      'source-layer': 'geodata_ispa25',
      paint: {
        'fill-color': fillColorExpr,
        'fill-opacity': 0.7,
        'fill-outline-color': '#000000'
      }
    });

    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true });

    function showPopup(feature, lngLat) {
      const ayuntamiento = feature.properties.AYUNTAMIENTO || 'Desconocido';
      const provincia = feature.properties.PROVINCIA || 'Desconocida';
      const nombre = feature.properties.NOMBRE || 'Sin información';
      const partido = feature.properties.PARTIDO || 'No disponible';
      const poblacionRaw = feature.properties.POBLACION;
      const poblacion = poblacionRaw != null ? formatPopulation(poblacionRaw) : 'Sin información';
      const sueldo =
        feature.properties.TOTAL_TXT === "No han remitido información al ISPA"
          ? '-'
          : (feature.properties.TOTAL_TXT || '-');
      const dedicacion = feature.properties.DEDICACION || 'No especificado';

      popup
        .setLngLat(lngLat)
        .setHTML(`
          <div class="popup-container">
            <div class="popup-header">
              <span class="popup-ayuntamiento">${ayuntamiento}</span> 
              <span class="popup-provincia">(${provincia})</span>
              <div class="popup-partido"><small>${poblacion} habitantes</small></div>
            </div>
            <div class="popup-body">
              <div class="popup-nombre"><strong>${nombre}</strong></div>
              <div class="popup-dedicacion">Dedicación: ${dedicacion}</div>
              <div class="popup-partido">${partido}</div>
            </div>
            <div class="popup-sueldo">${sueldo} €</div>
          </div>
        `)
        .addTo(map);
    }

    map.on('click', POLYGON_LAYER_ID, function(e) {
      showPopup(e.features[0], e.lngLat);
    });

    const salaryFilter = document.getElementById("salaryFilter");
    const salaryValue = document.getElementById("salaryValue");
    const dedicationFilter = document.getElementById("dedicationFilter");

    function updateSalaryValue(value) {
      const formattedSalary = Number(value).toLocaleString("es-ES");
      salaryValue.innerHTML = `<span style="white-space: nowrap;">${formattedSalary} €</span>`;
    }

    updateSalaryValue(salaryFilter.value);

    function applyCombinedFilters() {
      const salaryThreshold = Number(salaryFilter.value);
      const selectedDedication = dedicationFilter.value;

      const filters = ['all'];
      const salaryFilterExpr = ['>=', ['to-number', ['get', 'TOTAL']], salaryThreshold];
      filters.push(salaryFilterExpr);

      if (selectedDedication !== "all") {
        const dedicationFilterExpr = ['==', ['get', 'DEDICACION'], selectedDedication];
        filters.push(dedicationFilterExpr);
      }

      map.setFilter(POLYGON_LAYER_ID, filters);
    }

    salaryFilter.addEventListener("input", function() {
      updateSalaryValue(this.value);
      const min = Number(this.min);
      const max = Number(this.max);
      const percentage = ((this.value - min) / (max - min)) * 100;
      this.style.background = `linear-gradient(to right, #ddd ${percentage}%, #01f3b3 ${percentage}%)`;
      applyCombinedFilters();
    });

    dedicationFilter.addEventListener("change", function() {
      applyCombinedFilters();
    });

    document.getElementById('randomLocation').addEventListener('click', function() {
      setTimeout(() => {
        const polygons = map.queryRenderedFeatures({ layers: [POLYGON_LAYER_ID] });
        if (polygons.length === 0) {
          alert('No se encontraron polígonos visibles. Prueba a acercar más el mapa.');
          return;
        }

        const randomFeature = polygons[Math.floor(Math.random() * polygons.length)];
        const center = turf.center(randomFeature).geometry.coordinates;

        map.flyTo({ center, zoom: 6 });
        showPopup(randomFeature, center);
      }, 500);
    });

    // Geocoder usando Nominatim (OpenStreetMap) - 100% GRATUITO
    const geocoder = new MaplibreGeocoder({
      forwardGeocode: async (config) => {
        const features = [];
        try {
          const request = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(config.query)}&format=geojson&polygon_geojson=1&addressdetails=1&countrycodes=es`;
          const response = await fetch(request);
          const geojson = await response.json();
          
          for (const feature of geojson.features) {
            const center = [
              feature.bbox[0] + (feature.bbox[2] - feature.bbox[0]) / 2,
              feature.bbox[1] + (feature.bbox[3] - feature.bbox[1]) / 2
            ];
            const point = {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: center
              },
              place_name: feature.properties.display_name,
              properties: feature.properties,
              text: feature.properties.display_name,
              place_type: ['place'],
              center: center
            };
            features.push(point);
          }
        } catch (e) {
          console.error('Error en geocoding:', e);
        }

        return {
          features: features
        };
      }
    }, {
      maplibregl: maplibregl,
      placeholder: "   Buscar ubicación...",
      marker: false,
      flyTo: { zoom: 8, speed: 0.5, curve: 2 }
    });

    document.getElementById("geocoder-container").appendChild(geocoder.onAdd(map));

    geocoder.on('result', function() {
      salaryFilter.value = salaryFilter.min;
      updateSalaryValue(salaryFilter.min);
      salaryFilter.style.background = `linear-gradient(to right, #ddd 0%, #01f3b3 0%)`;
      applyCombinedFilters();
    });
  });
});