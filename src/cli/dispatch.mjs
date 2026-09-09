import { HELP_TEXT, COMMAND_HELP, GUIDE_TEXT } from './help.mjs';
import { parseArgs } from './parse.mjs';
import {
  handleStroke,
  handleRect,
  handleEllipse,
  handleFill,
  handleLayer,
  handleSubmit,
} from './draw-commands.mjs';
import {
  handleStatus,
  handleControl,
  handleSpeed,
  handleFeedback,
  handleSave,
  handleLoad,
} from './session-commands.mjs';
import {
  handleView,
  handleExport,
  handleWait,
  handleWatch,
} from './observe-commands.mjs';

const DRAW_FLAGS = ['paused', 'replace', 'json'];

const COMMANDS = {
  status: { flags: ['json'], fn: handleStatus },
  stroke: { flags: ['points', 'brush', 'color', 'size', 'opacity', 'layer', ...DRAW_FLAGS], fn: handleStroke },
  rect: { flags: ['x', 'y', 'width', 'height', 'color', 'opacity', 'layer', ...DRAW_FLAGS], fn: handleRect },
  ellipse: { flags: ['x', 'y', 'width', 'height', 'color', 'opacity', 'layer', ...DRAW_FLAGS], fn: handleEllipse },
  fill: { flags: ['color', ...DRAW_FLAGS], fn: handleFill },
  layer: { flags: ['name', 'opacity', 'visible', ...DRAW_FLAGS], fn: handleLayer },
  submit: { flags: ['replace', 'paused', 'json'], fn: handleSubmit },
  view: { flags: ['crop', 'scale', 'browser', 'json'], fn: handleView },
  export: { flags: ['crop', 'scale', 'browser', 'json'], fn: handleExport },
  wait: { flags: ['timeout', 'json'], fn: handleWait },
  watch: { flags: ['timeout', 'interval', 'json'], fn: handleWatch },
  pause: { flags: ['json'], fn: (pos, fl) => handleControl('pause', pos, fl) },
  resume: { flags: ['json'], fn: (pos, fl) => handleControl('resume', pos, fl) },
  step: { flags: ['json'], fn: (pos, fl) => handleControl('step', pos, fl) },
  clear: { flags: ['json'], fn: (pos, fl) => handleControl('clear', pos, fl) },
  undo: { flags: ['json'], fn: (pos, fl) => handleControl('undo', pos, fl) },
  redo: { flags: ['json'], fn: (pos, fl) => handleControl('redo', pos, fl) },
  new: { flags: ['json'], fn: (pos, fl) => handleControl('new', pos, fl) },
  speed: { flags: ['speed', 'json'], fn: handleSpeed },
  feedback: { flags: ['json'], fn: handleFeedback },
  save: { flags: [], fn: handleSave },
  load: { flags: ['json'], fn: handleLoad },
};

export async function dispatch(argv = []) {
  if (argv.length === 0) {
    console.log(HELP_TEXT);
    return;
  }

  const [first, ...rest] = argv;

  if (first === 'help' || first === '--help' || first === '-h') {
    if (rest.length > 1) {
      throw new Error('help accepts at most one command name: help [COMMAND]');
    }
    const target = rest[0];
    if (!target) {
      console.log(HELP_TEXT);
      return;
    }
    if (COMMAND_HELP[target]) {
      console.log(COMMAND_HELP[target]);
      return;
    }
    throw new Error(`unknown command "${target}"\n\n${HELP_TEXT}`);
  }

  if (first === 'guide') {
    if (rest.includes('--help') || rest.includes('-h')) {
      console.log(COMMAND_HELP.guide);
      return;
    }
    if (rest.length > 0) {
      throw new Error('guide does not accept positional arguments');
    }
    console.log(GUIDE_TEXT);
    return;
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    if (COMMAND_HELP[first]) {
      console.log(COMMAND_HELP[first]);
      return;
    }
  }

  const def = COMMANDS[first];
  if (!def) {
    throw new Error(`unknown command "${first}"\n\n${HELP_TEXT}`);
  }

  const { flags, positionals } = parseArgs(rest, [...def.flags, 'help', 'h']);
  if (flags.help || flags.h) {
    console.log(COMMAND_HELP[first] ?? HELP_TEXT);
    return;
  }

  await def.fn(positionals, flags);
}
