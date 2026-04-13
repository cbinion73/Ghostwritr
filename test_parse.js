// Simulate parseArtifactJson
function parseArtifactJson(value, fallback) {
  if (value && typeof value === "object") {
    return value;
  }
  return fallback;
}

// Test with real persona data
const personaData = {
  personas: [
    { name: "Dr. Emily Carlton", context: "test" },
    { name: "Dr. Mark Liu", context: "test" },
    { name: "Dr. Angela Thompson", context: "test" }
  ]
};

const fallbackPersonas = {
  personas: [
    { name: "Innovation Leader", context: "test" },
    { name: "Digital Transformation Executive", context: "test" }
  ]
};

const result = parseArtifactJson(personaData, fallbackPersonas);

console.log("Input data personas:", personaData.personas.map(p => p.name));
console.log("Fallback personas:", fallbackPersonas.personas.map(p => p.name));
console.log("Result personas:", result.personas.map(p => p.name));
console.log("Using fallback:", JSON.stringify(result) === JSON.stringify(fallbackPersonas));
