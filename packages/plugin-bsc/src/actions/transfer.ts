import { ByteArray, formatEther, parseEther, type Hex } from "viem";
import {
    composeContext,
    generateObjectDeprecated,
    HandlerCallback,
    ModelClass,
    type IAgentRuntime,
    type Memory,
    type State,
} from "@elizaos/core";

import { initWalletProvider, WalletProvider } from "../providers/wallet";
import type { Transaction, TransferParams } from "../types";
import { transferTemplate } from "../templates";

export { transferTemplate };

// Exported for tests
export class TransferAction {
    constructor(private walletProvider: WalletProvider) {}

    async transfer(params: TransferParams): Promise<Transaction> {
        console.log(
            `Transferring: ${params.amount} tokens to (${params.toAddress} on ${params.fromChain})`
        );

        if (!params.data) {
            params.data = "0x";
        }

        await this.walletProvider.switchChain(params.fromChain);

        const walletClient = this.walletProvider.getWalletClient(
            params.fromChain
        );

        try {
            const hash = await walletClient.sendTransaction({
                account: walletClient.account,
                to: params.toAddress,
                value: parseEther(params.amount),
                data: params.data as Hex,
                kzg: {
                    blobToKzgCommitment: function (blob: ByteArray): ByteArray {
                        throw new Error("Function not implemented.");
                    },
                    computeBlobKzgProof: function (
                        blob: ByteArray,
                        commitment: ByteArray
                    ): ByteArray {
                        throw new Error("Function not implemented.");
                    },
                },
                chain: undefined,
            });

            return {
                hash,
                from: walletClient.account.address,
                to: params.toAddress,
                value: parseEther(params.amount),
                data: params.data as Hex,
            };
        } catch (error) {
            throw new Error(`Transfer failed: ${error.message}`);
        }
    }
}

export const transferAction = {
    name: "transfer",
    description: "Transfer tokens between addresses on the same chain",
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        console.log("Transfer action handler called");
        const walletProvider = initWalletProvider(runtime);
        const action = new TransferAction(walletProvider);

        // Compose transfer context
        const transferContext = composeContext({
            state,
            template: transferTemplate,
        });
        const content = await generateObjectDeprecated({
            runtime,
            context: transferContext,
            modelClass: ModelClass.LARGE,
        });

        const paramOptions: TransferParams = {
            fromChain: content.fromChain,
            toAddress: content.toAddress,
            amount: content.amount,
            data: content.data,
        };

        try {
            const transferResp = await action.transfer(paramOptions);
            if (callback) {
                callback({
                    text: `Successfully transferred ${paramOptions.amount} tokens to ${paramOptions.toAddress}\nTransaction Hash: ${transferResp.hash}`,
                    content: {
                        success: true,
                        hash: transferResp.hash,
                        amount: formatEther(transferResp.value),
                        recipient: transferResp.to,
                        chain: content.fromChain,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error during token transfer:", error);
            if (callback) {
                callback({
                    text: `Error transferring tokens: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: transferTemplate,
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("BSC_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    examples: [
        [
            {
                user: "assistant",
                content: {
                    text: "I'll help you transfer 1 BNB to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                    action: "SEND_TOKENS",
                },
            },
            {
                user: "user",
                content: {
                    text: "Transfer 1 BNB to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
                    action: "SEND_TOKENS",
                },
            },
        ],
    ],
    similes: ["SEND_TOKENS", "TOKEN_TRANSFER", "MOVE_TOKENS"],
};
