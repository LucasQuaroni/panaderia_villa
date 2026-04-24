const q = "Independencia 154, Corral de Bustos, Córdoba, Argentina";
fetch("https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(q))
  .then(r => r.json())
  .then(d => console.log(d[0]?.lat, d[0]?.lon));
