import { styleText } from "node:util";

import type { SharedConfig } from "../types.js";

/** Preset mimicking @inquirer/prompts visual style */
export const inquirer: SharedConfig = {
  prefix: { pending: "? ", submitted: "✔ " },
  linePrefix: { pending: "  ", submitted: "  " },
  preferNewlineOnEnter: true,
  helpFooter: {
    items: ["submit", "newline"],
    keyStyle: "bold",
    actionStyle: "dim",
    separator: styleText("dim", " • "),
  },
  theme: {
    prefix: { pending: "blue", submitted: "green" },
    prompt: "bold",
    answer: "cyan",
    submitRender: "preserve",
    cancelRender: "preserve",
  },
};
