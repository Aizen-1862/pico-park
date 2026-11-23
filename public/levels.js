// Shared 20-stage campaign data. Loaded by both Node and the browser.
(function (root, factory) {
  const data = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.CATNAP_LEVELS = data;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const heights = [
    [410,370,390,350],[380,420,340,390],[420,350,390,330],[360,410,350,400],
    [400,340,410,350],[350,400,330,390],[420,380,340,400],[370,330,410,350],
    [410,350,390,320],[340,400,350,410],[390,330,410,350],[350,410,370,320],
    [420,360,400,330],[370,420,340,390],[400,350,420,330],[340,390,330,410],
    [410,330,390,350],[360,420,340,400],[400,340,410,320],[330,410,350,390]
  ];
  const names = [
    "First Steps","Split Decision","High Ground","Switch Sprint","The Long Jump",
    "Twin Peaks","Staggered Path","Key Above","Four Corners","Narrow Escape",
    "Moving Minds","Crossfire","The Climb","Pressure Points","Broken Bridge",
    "The Gauntlet","Skyline","Last Relay","Master Switches","The Final Team"
  ];
  const hints = [
    "Find the glowing key, then get everyone to the door.",
    "Split up: two switches are better than one.",
    "The switches are at different heights. Coordinate your jumps.",
    "One teammate scouts ahead while others hold the switches.",
    "Reach the far platforms without leaving anyone behind.",
    "Use the lower route to help teammates reach the upper switch.",
    "Take turns jumping. The team needs two active switches.",
    "The key is high up. Use the platforms as stepping stones.",
    "Cover opposite sides of the room at the same time.",
    "The platforms are uneven. Communicate before jumping.",
    "More switches are needed as your team grows.",
    "Spread out and keep each switch occupied.",
    "Work your way up, then regroup at the exit.",
    "Do not rush the switches. Hold them together.",
    "Use the staggered platforms to cross the room.",
    "Everyone has a role. Keep the team coordinated.",
    "Reach the upper route and bring the whole crew along.",
    "Relay between platforms and keep the switches active.",
    "Four corners, one team. Coordinate every move.",
    "Final challenge: divide the team, get the key, and escape together."
  ];
  return heights.map((ys, i) => ({
    id: i + 1,
    name: names[i],
    hint: hints[i],
    platforms: [
      {x:0,y:500,w:960,h:40},
      {x:105,y:ys[0],w:132,h:18},
      {x:300,y:ys[1],w:132,h:18},
      {x:495,y:ys[2],w:132,h:18},
      {x:690,y:ys[3],w:132,h:18},
      {x:855,y:Math.max(350, ys[1] + (i % 2 ? 18 : -12)),w:105,h:18}
    ],
    switches: [171,366,561,756].map((x, n) => ({
      x, y: ys[n] - 15, platform: n + 1
    })),
    key: {x: 560, y: Math.min(ys[2] - 52, 270)},
    exit: {x: 900, y: 430}
  }));
});