import { post, get } from './client.mjs';
import {
  parsePoints,
  parseColor,
  parseIdentifier,
  parseFiniteNumber,
  parseBoolean,
  readBoundedFile,
  readStdin,
} from './parse.mjs';
import { formatLayers } from './format.mjs';

function printMutation(res, flags, label) {
  if (flags.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    const status = res.playback?.status ?? 'idle';
    const remaining = res.playback?.remaining ?? 0;
    console.log(`${label} - playback: ${status}, ${remaining} remaining (revision ${res.revision})`);
  }
}

function buildGeometryCommand(type, flags) {
  for (const req of ['x', 'y', 'width', 'height']) {
    if (flags[req] === undefined) {
      throw new Error(`${type} requires flag "--${req}"`);
    }
  }
  const x = parseFiniteNumber(flags.x, 'x', 0, 1000);
  const y = parseFiniteNumber(flags.y, 'y', 0, 700);
  const width = parseFiniteNumber(flags.width, 'width', 1, 1000);
  const height = parseFiniteNumber(flags.height, 'height', 1, 700);
  const color = parseColor(flags.color ?? '#253d38');
  const opacity = flags.opacity !== undefined ? parseFiniteNumber(flags.opacity, 'opacity', 0, 1) : 1;
  const layer = flags.layer !== undefined ? parseIdentifier(flags.layer) : 'paint';
  return { type, layer, x, y, width, height, color, opacity };
}

export async function handleStroke(positionals, flags) {
  if (positionals.length > 0) {
    throw new Error('stroke does not accept positional arguments');
  }
  if (!flags.points) {
    throw new Error('stroke requires --points "x,y x,y...": stroke --points "10,20 30,40"');
  }
  const points = parsePoints(flags.points);
  const brush = flags.brush ?? 'brush';
  if (!['brush', 'pencil', 'marker', 'eraser'].includes(brush)) {
    throw new Error(`unknown brush "${brush}" (expected brush, pencil, marker, or eraser)`);
  }
  const color = parseColor(flags.color ?? '#253d38');
  const size = flags.size !== undefined ? parseFiniteNumber(flags.size, 'size', 1, 100) : 8;
  const opacity = flags.opacity !== undefined ? parseFiniteNumber(flags.opacity, 'opacity', 0, 1) : 1;
  const layer = flags.layer !== undefined ? parseIdentifier(flags.layer) : 'paint';

  const command = { type: 'stroke', layer, brush, color, size, opacity, points };
  const res = await post('/api/commands', {
    commands: [command],
    replace: Boolean(flags.replace),
    play: !flags.paused,
  });
  printMutation(res, flags, `Queued stroke (${points.length} points on "${layer}")`);
}

export async function handleRect(positionals, flags) {
  if (positionals.length > 0) {
    throw new Error('rect does not accept positional arguments');
  }
  const command = buildGeometryCommand('rect', flags);
  const res = await post('/api/commands', {
    commands: [command],
    replace: Boolean(flags.replace),
    play: !flags.paused,
  });
  printMutation(res, flags, `Queued rect (${command.x},${command.y} ${command.width}x${command.height} on "${command.layer}")`);
}

export async function handleEllipse(positionals, flags) {
  if (positionals.length > 0) {
    throw new Error('ellipse does not accept positional arguments');
  }
  const command = buildGeometryCommand('ellipse', flags);
  const res = await post('/api/commands', {
    commands: [command],
    replace: Boolean(flags.replace),
    play: !flags.paused,
  });
  printMutation(res, flags, `Queued ellipse (${command.x},${command.y} ${command.width}x${command.height} on "${command.layer}")`);
}

export async function handleFill(positionals, flags) {
  if (positionals.length > 1) {
    throw new Error('fill takes at most one argument: fill COLOR');
  }
  const rawColor = positionals[0] ?? flags.color;
  if (!rawColor) {
    throw new Error('fill requires COLOR: fill COLOR');
  }
  const color = parseColor(rawColor);
  const command = { type: 'fill', color };
  const res = await post('/api/commands', {
    commands: [command],
    replace: Boolean(flags.replace),
    play: !flags.paused,
  });
  printMutation(res, flags, `Queued fill to ${color}`);
}

export async function handleLayer(positionals, flags) {
  const sub = positionals[0];
  if (!sub) {
    throw new Error('layer requires subcommand (list, add, update): layer list | layer add ID NAME | layer update ID');
  }
  if (sub === 'list') {
    if (positionals.length > 1) {
      throw new Error('layer list does not accept additional arguments');
    }
    const disallowed = Object.keys(flags).find((k) => k !== 'json' && k !== 'help' && k !== 'h');
    if (disallowed) {
      throw new Error(`unknown flag "--${disallowed}" for layer list`);
    }
    const snapshot = await get('/api/state');
    if (flags.json) {
      console.log(JSON.stringify(snapshot.document?.layers ?? [], null, 2));
    } else {
      console.log(formatLayers(snapshot.document?.layers ?? []));
    }
    return;
  }
  if (sub === 'add') {
    if (positionals.length !== 3) {
      throw new Error('layer add requires ID and NAME: layer add ID NAME');
    }
    const disallowed = Object.keys(flags).find((k) => !['paused', 'replace', 'json', 'help', 'h'].includes(k));
    if (disallowed) {
      throw new Error(`unknown flag "--${disallowed}" for layer add`);
    }
    const cleanId = parseIdentifier(positionals[1]);
    const name = positionals[2].trim();
    const command = { type: 'layer.add', id: cleanId, name };
    const res = await post('/api/commands', {
      commands: [command],
      replace: Boolean(flags.replace),
      play: !flags.paused,
    });
    printMutation(res, flags, `Queued layer add "${cleanId}" ("${name}")`);
    return;
  }
  if (sub === 'update') {
    if (positionals.length !== 2) {
      throw new Error('layer update requires exactly ID: layer update ID [--name NAME] [--opacity N] [--visible true|false]');
    }
    const disallowed = Object.keys(flags).find(
      (k) => !['name', 'opacity', 'visible', 'paused', 'replace', 'json', 'help', 'h'].includes(k)
    );
    if (disallowed) {
      throw new Error(`unknown flag "--${disallowed}" for layer update`);
    }
    const cleanId = parseIdentifier(positionals[1]);
    if (flags.name === undefined && flags.opacity === undefined && flags.visible === undefined) {
      throw new Error('layer update requires at least one property: --name, --opacity, or --visible');
    }
    const update = { type: 'layer.update', id: cleanId };
    if (flags.name !== undefined) update.name = flags.name.trim();
    if (flags.opacity !== undefined) update.opacity = parseFiniteNumber(flags.opacity, 'opacity', 0, 1);
    if (flags.visible !== undefined) update.visible = parseBoolean(flags.visible, 'visible');

    const res = await post('/api/commands', {
      commands: [update],
      replace: Boolean(flags.replace),
      play: !flags.paused,
    });
    printMutation(res, flags, `Queued layer update "${cleanId}"`);
    return;
  }
  throw new Error(`unknown layer subcommand "${sub}" (expected list, add, or update)`);
}

export async function handleSubmit(positionals, flags) {
  if (positionals.length !== 1) {
    throw new Error('submit requires exactly one argument: submit FILE|-');
  }
  const file = positionals[0];
  const raw = file === '-' ? await readStdin() : readBoundedFile(file);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON in submit input: ${err.message}`);
  }
  const commands = Array.isArray(parsed) ? parsed : parsed?.commands;
  if (!Array.isArray(commands) || !commands.length) {
    throw new Error('submit requires a non-empty JSON array of commands or an object with a "commands" array');
  }
  const res = await post('/api/commands', {
    commands,
    replace: Boolean(flags.replace),
    play: !flags.paused,
  });
  printMutation(res, flags, `Queued ${commands.length} command(s)`);
}
