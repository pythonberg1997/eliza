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
import { formatEther, Hex, parseEther, getContract, Address } from "viem";

import { initWalletProvider, WalletProvider } from "../providers/wallet";
import { bridgeTemplate } from "../templates";
import {
    ERC20Abi,
    L1StandardBridgeAbi,
    L2StandardBridgeAbi,
    type Transaction,
    type BridgeParams,
    type SupportedChain,
} from "../types";

export { bridgeTemplate };

// Exported for tests
export class BridgeAction {
    private readonly L1_BRIDGE_ADDRESS =
        "0xF05F0e4362859c3331Cb9395CBC201E3Fa6757Ea" as const;
    private readonly L2_BRIDGE_ADDRESS =
        "0x4000698e3De52120DE28181BaACda82B21568416" as const;
    private readonly LEGACY_ERC20_ETH =
        "0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000" as const;
    private readonly L2_DELEGATION_FEE = 600000000000000n as const;

    constructor(private walletProvider: WalletProvider) {}

    async bridge(params: BridgeParams): Promise<Transaction> {
        const fromAddress = this.walletProvider.getAddress();

        this.walletProvider.switchChain(params.fromChain);
        const walletClient = this.walletProvider.getWalletClient(
            params.fromChain
        );
        const publicClient = this.walletProvider.getPublicClient(
            params.fromChain
        );

        try {
            let hash: Hex;
            let contract: Address;
            let value = parseEther(params.amount);

            const account = walletClient.account!;
            const chain = this.walletProvider.getChainConfigs(params.fromChain);

            const selfBridge =
                !params.toAddress || params.toAddress == fromAddress;
            const nativeTokenBridge = !params.fromToken;

            if (params.fromChain == "bsc" && params.toChain == "opBNB") {
                // from L1 to L2
                const l1BridgeContract = getContract({
                    address: this.L1_BRIDGE_ADDRESS,
                    abi: L1StandardBridgeAbi,
                    client: {
                        public: publicClient,
                        wallet: walletClient,
                    },
                });
                contract = this.L1_BRIDGE_ADDRESS;

                // check ERC20 allowance
                if (!nativeTokenBridge) {
                    this.checkTokenAllowance(
                        params.fromChain,
                        params.fromToken!,
                        fromAddress,
                        this.L1_BRIDGE_ADDRESS,
                        value
                    );
                }

                if (selfBridge && nativeTokenBridge) {
                    const args = [1, "0x"] as const;
                    await l1BridgeContract.simulate.depositETH(args);
                    hash = await l1BridgeContract.write.depositETH(args, {
                        account,
                        chain,
                        value,
                    });
                } else if (selfBridge && !nativeTokenBridge) {
                    const args = [
                        params.fromToken!,
                        params.toToken!,
                        value,
                        1,
                        "0x",
                    ] as const;
                    await l1BridgeContract.simulate.depositERC20(args);
                    hash = await l1BridgeContract.write.depositERC20(args, {
                        account,
                        chain,
                    });
                    value = 0n;
                } else if (!selfBridge && nativeTokenBridge) {
                    const args = [params.toAddress!, 1, "0x"] as const;
                    await l1BridgeContract.simulate.depositETHTo(args);
                    hash = await l1BridgeContract.write.depositETHTo(args, {
                        account,
                        chain,
                        value,
                    });
                } else {
                    const args = [
                        params.fromToken!,
                        params.toToken!,
                        params.toAddress!,
                        value,
                        1,
                        "0x",
                    ] as const;
                    await l1BridgeContract.simulate.depositERC20To(args);
                    hash = await l1BridgeContract.write.depositERC20To(args, {
                        account,
                        chain,
                    });
                    value = 0n;
                }
            } else if (params.fromChain == "opBNB" && params.toChain == "bsc") {
                // from L2 to L1
                const l2BridgeContract = getContract({
                    address: this.L2_BRIDGE_ADDRESS,
                    abi: L2StandardBridgeAbi,
                    client: {
                        public: publicClient,
                        wallet: walletClient,
                    },
                });
                contract = this.L2_BRIDGE_ADDRESS;

                // check ERC20 allowance
                if (!nativeTokenBridge) {
                    this.checkTokenAllowance(
                        params.fromChain,
                        params.fromToken!,
                        fromAddress,
                        this.L2_BRIDGE_ADDRESS,
                        value
                    );
                }

                if (selfBridge && nativeTokenBridge) {
                    const args = [
                        this.LEGACY_ERC20_ETH,
                        value,
                        1,
                        "0x",
                    ] as const;
                    value = value + this.L2_DELEGATION_FEE;
                    await l2BridgeContract.simulate.withdraw(args, { value });
                    hash = await l2BridgeContract.write.withdraw(args, {
                        account,
                        chain,
                        value,
                    });
                } else if (selfBridge && !nativeTokenBridge) {
                    const args = [params.fromToken!, value, 1, "0x"] as const;
                    value = value + this.L2_DELEGATION_FEE;
                    await l2BridgeContract.simulate.withdraw(args, { value });
                    hash = await l2BridgeContract.write.withdraw(args, {
                        account,
                        chain,
                        value,
                    });
                } else if (!selfBridge && nativeTokenBridge) {
                    const args = [
                        this.LEGACY_ERC20_ETH,
                        params.toAddress!,
                        value,
                        1,
                        "0x",
                    ] as const;
                    value = value + this.L2_DELEGATION_FEE;
                    await l2BridgeContract.simulate.withdrawTo(args, { value });
                    hash = await l2BridgeContract.write.withdrawTo(args, {
                        account,
                        chain,
                        value,
                    });
                } else {
                    const args = [
                        params.fromToken!,
                        params.toAddress!,
                        value,
                        1,
                        "0x",
                    ] as const;
                    value = this.L2_DELEGATION_FEE;
                    await l2BridgeContract.simulate.withdrawTo(args, { value });
                    hash = await l2BridgeContract.write.withdrawTo(args, {
                        account,
                        chain,
                        value,
                    });
                }
            } else {
                throw new Error("Unsupported bridge direction");
            }

            return {
                hash,
                from: fromAddress,
                to: contract,
                value,
            };
        } catch (error) {
            console.error("Error during token bridge:", error);
            throw error;
        }
    }

    async checkTokenAllowance(
        chain: SupportedChain,
        token: Address,
        owner: Address,
        spender: Address,
        amount: bigint
    ) {
        const publicClient = this.walletProvider.getPublicClient(chain);
        const allowance = await publicClient.readContract({
            address: token,
            abi: ERC20Abi,
            functionName: "allowance",
            args: [owner, spender],
        });

        if (allowance < amount) {
            elizaLogger.log("Increasing allowance for ERC20 bridge");
            const walletClient = this.walletProvider.getWalletClient(chain);
            const { request } = await publicClient.simulateContract({
                account: walletClient.account,
                address: token,
                abi: ERC20Abi,
                functionName: "increaseAllowance",
                args: [spender, amount - allowance],
            });

            await walletClient.writeContract(request);
        }
    }
}

export const bridgeAction = {
    name: "bridge",
    description: "Bridge tokens between chains",
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Bridge action handler called");
        const walletProvider = initWalletProvider(runtime);
        const action = new BridgeAction(walletProvider);

        // Compose bridge context
        const bridgeContext = composeContext({
            state,
            template: bridgeTemplate,
        });
        const content = await generateObjectDeprecated({
            runtime,
            context: bridgeContext,
            modelClass: ModelClass.LARGE,
        });

        const paramOptions: BridgeParams = {
            fromChain: content.fromChain,
            toChain: content.toChain,
            fromToken: content.fromToken,
            toToken: content.toToken,
            amount: content.amount,
            toAddress: content.toAddress,
        };

        try {
            const bridgeResp = await action.bridge(paramOptions);
            if (callback) {
                const tokenText = paramOptions.fromToken
                    ? `${paramOptions.fromToken} tokens`
                    : "BNB";
                const toAddressText = paramOptions.toAddress
                    ? `to ${paramOptions.toAddress} `
                    : "";
                callback({
                    text: `Successfully bridged ${paramOptions.amount} ${tokenText} ${toAddressText}from ${content.fromChain} to ${content.toChain}\nTransaction Hash: ${bridgeResp.hash}`,
                    content: {
                        success: true,
                        hash: bridgeResp.hash,
                        amount: formatEther(content.amount),
                        recipient: bridgeResp.to,
                        chain: content.fromChain,
                    },
                });
            }
            return true;
        } catch (error) {
            console.error("Error during token bridge:", error);
            if (callback) {
                callback({
                    text: `Error during token bridge: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    template: bridgeTemplate,
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("BSC_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    examples: [
        [
            {
                user: "user",
                content: {
                    text: "Transfer 1 BNB from bsc to opBNB",
                    action: "BRIDGE",
                },
            },
        ],
    ],
    similes: ["BRIDGE", "TOKEN_BRIDGE"],
};
