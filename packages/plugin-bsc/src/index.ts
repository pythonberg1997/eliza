export * from "./actions/swap";
export * from "./actions/transfer";
export * from "./providers/wallet";
export * from "./types";

import type { Plugin } from "@elizaos/core";
import { swapAction } from "./actions/swap";
import { transferAction } from "./actions/transfer";
import { bscWalletProvider } from "./providers/wallet";

export const bscPlugin: Plugin = {
    name: "bsc",
    description: "BNB Smart Chain integration plugin",
    providers: [bscWalletProvider],
    evaluators: [],
    services: [],
    actions: [transferAction, swapAction],
};

export default bscPlugin;
