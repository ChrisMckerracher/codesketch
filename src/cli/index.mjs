import { dispatch } from "./dispatch.mjs";

export async function main(argv = process.argv.slice(2)) {
  const isJson = argv.includes("--json");
  try {
    await dispatch(argv);
  } catch (error) {
    if (isJson) {
      console.error(JSON.stringify({
        error: error.code || "ERROR",
        message: error.message,
      }));
    } else {
      console.error(`paint: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

export { dispatch };
