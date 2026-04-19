const arr = [{time: 1}, {time: 5}, {time: 10}];
const startT = 4;
const minIdx = arr.findIndex(c => c.time >= startT);
console.log(minIdx);
