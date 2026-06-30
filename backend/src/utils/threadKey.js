function getCanonicalKey(nodeIds) {
  return [...nodeIds].sort((a, b) => a - b).join('-');
}

module.exports = { getCanonicalKey };
