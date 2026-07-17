function cleanAssociatedPeople(people = []) {
  const uniqueNames = new Map();
  for (const value of people) {
    for (const part of String(value || '').split(/[,，]/)) {
      const name = part.trim();
      const key = name.toLocaleLowerCase();
      if (name && !uniqueNames.has(key)) {
        uniqueNames.set(key, name);
      }
    }
  }
  return [...uniqueNames.values()];
}

module.exports = {
  cleanAssociatedPeople
};
