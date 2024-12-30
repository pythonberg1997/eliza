export * from "./actions/swap";
export * from "./actions/transfer";
export * from "./providers/wallet";
export * from "./types";

import type { Plugin } from "@elizaos/core";
import { swapAction } from "./actions/swap";
import { transferAction } from "./actions/transfer";
import { bscWalletProvider } from "./providers/wallet";
import { getBalanceAction } from "./actions/getBalance";
import { bridgeAction } from "./actions/bridge";
import { faucetAction } from "./actions/faucet";

export const bscPlugin: Plugin = {
    name: "bsc",
    description: "BNB Smart Chain integration plugin",
    providers: [bscWalletProvider],
    evaluators: [],
    services: [],
    actions: [
        getBalanceAction,
        transferAction,
        swapAction,
        bridgeAction,
        faucetAction,
    ],
};

export default bscPlugin;
