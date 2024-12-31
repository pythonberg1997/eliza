import {
    composeContext,
    elizaLogger,
    generateObjectDeprecated,
    HandlerCallback,
    ModelClass,
    type IAgentRuntime,
    type Memory,
    type State,
} from "@elizaos/core";
import {
    formatEther,
    formatUnits,
    parseEther,
    parseUnits,
    type Hex,
} from "viem";

import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { transferTemplate } from "../templates";
import { ERC20Abi, type TransferParams, type TransferResponse } from "../types";

export { transferTemplate };

// Exported for tests
export class TransferAction {
    private readonly BSC_DEFAULT_GAS_PRICE = 3000000000n as const; // 3 Gwei
    constructor(private walletProvider: WalletProvider) {}

    async transfer(params: TransferParams): Promise<TransferResponse> {
        const fromAddress = this.walletProvider.getAddress();

        if (!params.data) {
            params.data = "0x";
        }

        this.walletProvider.switchChain(params.chain);
        const walletClient = this.walletProvider.getWalletClient(params.chain);

        try {
            const nativeToken =
                this.walletProvider.chains[params.chain].nativeCurrency.symbol;

            let resp: TransferResponse = {
                chain: params.chain,
                txHash: "0x",
                recipient: params.toAddress,
                amount: "",
                token: params.token ?? nativeToken,
            };

            if (!params.token || params.token == nativeToken) {
                // Native token transfer
                if (!params.amount) {
                    const publicClient = this.walletProvider.getPublicClient(
                        params.chain
                    );
                    const balance = await publicClient.getBalance({
                        address: fromAddress,
                    });

                    const value = balance - this.BSC_DEFAULT_GAS_PRICE * 21000n;
                    const hash = await walletClient.sendTransaction({
                        account: walletClient.account!,
                        to: params.toAddress,
                        value: value,
                        gas: 21000n,
                        gasPrice: this.BSC_DEFAULT_GAS_PRICE,
                        data: params.data as Hex,
                        chain: this.walletProvider.getChainConfigs(
                            params.chain
                        ),
                    });

                    resp.txHash = hash;
                    resp.amount = formatEther(value);
                } else {
                    const value = parseEther(params.amount);
                    const hash = await walletClient.sendTransaction({
                        account: walletClient.account!,
                        to: params.toAddress,
                        value: value,
                        data: params.data as Hex,
                        chain: this.walletProvider.getChainConfigs(
                            params.chain
                        ),
                    });

                    resp.txHash = hash;
                    resp.amount = params.amount;
                }
            } else {
                // ERC20 token transfer
                let tokenAddress = params.token;
                if (!params.token.startsWith("0x")) {
                    const resolvedAddress =
                        await this.walletProvider.getTokenAddress(
                            params.chain,
                            params.token
                        );
                    if (!resolvedAddress) {
                        throw new Error(
                            `Unknown token symbol ${params.token}. Please provide a valid token address.`
                        );
                    }
                    tokenAddress = resolvedAddress;
                }

                const publicClient = this.walletProvider.getPublicClient(
                    params.chain
                );
                const decimals = await publicClient.readContract({
                    address: tokenAddress as `0x${string}`,
                    abi: ERC20Abi,
                    functionName: "decimals",
                });

                let value: bigint;
                if (!params.amount) {
                    value = await publicClient.readContract({
                        address: tokenAddress as `0x${string}`,
                        abi: ERC20Abi,
                        functionName: "balanceOf",
                        args: [fromAddress],
                    });
                } else {
                    value = parseUnits(params.amount, decimals);
                }

                const { request } = await publicClient.simulateContract({
                    account: walletClient.account,
                    address: tokenAddress as `0x${string}`,
                    abi: ERC20Abi,
                    functionName: "transfer",
                    args: [params.toAddress as `0x${string}`, value],
                });

                const hash = await walletClient.writeContract(request);

                resp.txHash = hash;
                resp.amount = formatUnits(value, decimals);
            }

            return resp;
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
        message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting transfer action...");

        // Validate transfer
        if (!(message.content.source === "direct")) {
            callback?.({
                text: "I can't do that for you.",
                content: { error: "Transfer not allowed" },
            });
            return false;
        }

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

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
            chain: content.chain,
            token: content.token,
            amount: content.amount,
            toAddress: content.toAddress,
            data: content.data,
        };

        const walletProvider = initWalletProvider(runtime);
        const action = new TransferAction(walletProvider);
        try {
            const transferResp = await action.transfer(paramOptions);
            callback?.({
                text: `Successfully transferred ${transferResp.amount} ${transferResp.token} to ${transferResp.recipient}\nTransaction Hash: ${transferResp.txHash}`,
                content: { ...transferResp },
            });

            return true;
        } catch (error) {
            elizaLogger.error("Error during transfer:", error);
            callback?.({
                text: `Transfer failed`,
                content: { error: error.message },
            });
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
