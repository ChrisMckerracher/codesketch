// Playback pace derives from stroke path length so every command animates
// consistently during live ticks and after a recovery restore rebuilds the
// active preview from the queue head.
export function playbackDuration(command) {
  let distance = 0;
  command.points?.forEach((point, index, points) => {
    if (index) distance += Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]);
  });
  return Math.max(120, distance / 0.55);
}
