# `@ai16z/plugin-bsc`

This plugin provides actions and providers for interacting with BNB Smart Chain.

---

## Configuration

### Default Setup

By default, **BNB Smart Chain** are enabled. To use it, simply add your private key to the `.env` file:

```env
BSC_PRIVATE_KEY=your-private-key-here
```

### Custom RPC URLs

By default, the RPC URL is inferred from the `viem/chains` config. To use custom RPC URLs, add the following to your `.env` file:

```env
BSC_PROVIDER_URL=https://your-custom-bsc-rpc-url
BSC_TESTNET_PROVIDER_URL=https://your-custom-bsc-testnet-rpc-url
```

## Provider

The **Wallet Provider** initializes with bsc as the default. It:

- Provides the **context** of the currently connected address and its balance.
- Creates **Public** and **Wallet clients** to interact with the supported chains.
- Allows adding chains dynamically at runtime.

---

## Actions

### Transfer

Transfer tokens from one address to another on bsc. Just specify the:

- **Amount**
- **Recipient Address**

**Example usage:**

```bash
Transfer 1 BNB to 0xRecipient.
```

---

## Contribution

The plugin contains tests. Whether you're using **TDD** or not, please make sure to run the tests before submitting a PR.

### Running Tests

Navigate to the `plugin-bsc` directory and run:

```bash
pnpm test
```
