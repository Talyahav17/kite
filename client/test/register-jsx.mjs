import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./jsx-hooks.mjs", pathToFileURL(import.meta.filename));
