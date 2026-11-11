// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Synthetic-test EVM representation with issuer eligibility and bridge-only minting.
/// @dev This is a deliberately small ERC-20 implementation to keep the demo's bridge controls
///      auditable. It is not a production token or a claim on any real-world asset.
contract PermissionedBridgeToken {
    error NotOwner();
    error NotIssuer();
    error NotBridge();
    error ZeroAddress();
    error AssetPaused();
    error Ineligible(address account);
    error InsufficientBalance();
    error InsufficientAllowance();
    error CapExceeded();
    error InvalidCap();
    error EmptyNearRecipient();

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public cap;
    address public owner;
    address public issuer;
    address public bridge;
    bool public protocolPaused;
    bool public issuerPaused;
    uint64 public nextBridgeNonce;

    mapping(address account => uint256) public balanceOf;
    mapping(address ownerAccount => mapping(address spender => uint256)) public allowance;
    mapping(address account => bool) public eligible;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event EligibilityUpdated(address indexed account, bool eligible);
    event BridgeUpdated(address indexed bridge);
    event IssuerUpdated(address indexed issuer);
    event CapUpdated(uint256 cap);
    event ProtocolPauseUpdated(bool paused);
    event IssuerPauseUpdated(bool paused);
    event BridgeMinted(address indexed recipient, uint256 amount);
    event BridgeOut(uint64 indexed nonce, address indexed sender, string recipientNear, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    modifier onlyBridge() {
        if (msg.sender != bridge) revert NotBridge();
        _;
    }

    modifier whenTransferOpen() {
        if (protocolPaused || issuerPaused) revert AssetPaused();
        _;
    }

    constructor(string memory name_, string memory symbol_, address issuer_, address bridge_, uint256 cap_) {
        if (issuer_ == address(0) || bridge_ == address(0)) revert ZeroAddress();
        if (cap_ == 0) revert InvalidCap();
        name = name_;
        symbol = symbol_;
        owner = msg.sender;
        issuer = issuer_;
        bridge = bridge_;
        cap = cap_;
        eligible[msg.sender] = true;
        eligible[issuer_] = true;
        eligible[bridge_] = true;
        emit EligibilityUpdated(msg.sender, true);
        emit EligibilityUpdated(issuer_, true);
        emit EligibilityUpdated(bridge_, true);
    }

    function paused() external view returns (bool) {
        return protocolPaused || issuerPaused;
    }

    function setEligible(address account, bool isEligible) external onlyIssuer {
        if (account == address(0)) revert ZeroAddress();
        eligible[account] = isEligible;
        emit EligibilityUpdated(account, isEligible);
    }

    function setBridge(address bridge_) external onlyOwner {
        if (bridge_ == address(0)) revert ZeroAddress();
        bridge = bridge_;
        emit BridgeUpdated(bridge_);
    }

    function setIssuer(address issuer_) external onlyOwner {
        if (issuer_ == address(0)) revert ZeroAddress();
        issuer = issuer_;
        emit IssuerUpdated(issuer_);
    }

    function setCap(uint256 cap_) external onlyIssuer {
        if (cap_ < totalSupply) revert CapExceeded();
        cap = cap_;
        emit CapUpdated(cap_);
    }

    function setProtocolPaused(bool paused_) external onlyOwner {
        protocolPaused = paused_;
        emit ProtocolPauseUpdated(paused_);
    }

    function setIssuerPaused(bool paused_) external onlyIssuer {
        issuerPaused = paused_;
        emit IssuerPauseUpdated(paused_);
    }

    function approve(address spender, uint256 amount) external whenTransferOpen returns (bool) {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external whenTransferOpen returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external whenTransferOpen returns (bool) {
        uint256 permitted = allowance[sender][msg.sender];
        if (permitted < amount) revert InsufficientAllowance();
        unchecked {
            allowance[sender][msg.sender] = permitted - amount;
        }
        emit Approval(sender, msg.sender, allowance[sender][msg.sender]);
        _transfer(sender, recipient, amount);
        return true;
    }

    /// @notice Mints a destination representation after the bridge has verified a NEAR lock/burn.
    function bridgeMint(address recipient, uint256 amount) external onlyBridge whenTransferOpen {
        _requireEligible(recipient);
        if (totalSupply + amount > cap) revert CapExceeded();
        totalSupply += amount;
        balanceOf[recipient] += amount;
        emit Transfer(address(0), recipient, amount);
        emit BridgeMinted(recipient, amount);
    }

    /// @notice Burns a representation and exposes the unique event a relayer attests to NEAR.
    function bridgeOut(string calldata recipientNear, uint256 amount) external whenTransferOpen returns (uint64 nonce) {
        if (bytes(recipientNear).length == 0) revert EmptyNearRecipient();
        _requireEligible(msg.sender);
        _burn(msg.sender, amount);
        nonce = nextBridgeNonce;
        unchecked {
            nextBridgeNonce = nonce + 1;
        }
        emit BridgeOut(nonce, msg.sender, recipientNear, amount);
    }

    function _transfer(address sender, address recipient, uint256 amount) private {
        if (recipient == address(0)) revert ZeroAddress();
        _requireEligible(sender);
        _requireEligible(recipient);
        uint256 balance = balanceOf[sender];
        if (balance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[sender] = balance - amount;
        }
        balanceOf[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }

    function _burn(address account, uint256 amount) private {
        uint256 balance = balanceOf[account];
        if (balance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[account] = balance - amount;
            totalSupply -= amount;
        }
        emit Transfer(account, address(0), amount);
    }

    function _requireEligible(address account) private view {
        if (!eligible[account]) revert Ineligible(account);
    }
}
