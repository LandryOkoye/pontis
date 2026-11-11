// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {PermissionedBridgeToken} from "./PermissionedBridgeToken.sol";

/// @notice M-of-N ECDSA fallback authority for local bridge demonstrations.
/// @dev Signatures are attestations, not chain proofs. Production must replace this trust model or
///      connect a verified destination authority such as NEAR Chain Signatures.
contract BridgeAttestationVerifier {
    error NotOwner();
    error InvalidThreshold();
    error InvalidAttester();
    error InvalidAttestation();
    error AttestationExpired();
    error AlreadyConsumed(bytes32 operationId);
    error InsufficientSignatures();
    error InvalidSignature();
    error DuplicateSigner();

    bytes32 public constant ATTESTATION_DOMAIN = keccak256("pontis-bridge-mint-attestation-v1");
    PermissionedBridgeToken public immutable token;
    bytes32 public immutable routeId;
    address public immutable owner;
    uint8 public threshold;
    uint256 public attesterCount;

    mapping(address attester => bool enabled) public isAttester;
    mapping(bytes32 operationId => bool consumed) public consumedOperation;

    struct MintAttestation {
        uint256 sourceChainId;
        bytes32 sourceBridge;
        bytes32 operationId;
        address recipient;
        uint256 amount;
        uint256 expiresAt;
    }

    event AttesterUpdated(address indexed attester, bool enabled);
    event ThresholdUpdated(uint8 threshold);
    event MintAttested(bytes32 indexed operationId, address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(PermissionedBridgeToken token_, bytes32 routeId_, uint8 threshold_) {
        if (address(token_) == address(0) || routeId_ == bytes32(0) || threshold_ == 0) {
            revert InvalidAttestation();
        }
        token = token_;
        routeId = routeId_;
        owner = msg.sender;
        threshold = threshold_;
    }

    function setAttester(address attester, bool enabled) external onlyOwner {
        if (attester == address(0)) revert InvalidAttester();
        if (isAttester[attester] != enabled) {
            if (enabled && attesterCount == type(uint8).max) revert InvalidThreshold();
            isAttester[attester] = enabled;
            if (enabled) {
                attesterCount += 1;
            } else {
                attesterCount -= 1;
            }
        }
        if (!enabled && attesterCount < threshold) revert InvalidThreshold();
        emit AttesterUpdated(attester, enabled);
    }

    function setThreshold(uint8 threshold_) external onlyOwner {
        if (threshold_ == 0 || threshold_ > attesterCount) revert InvalidThreshold();
        threshold = threshold_;
        emit ThresholdUpdated(threshold_);
    }

    function digest(MintAttestation calldata attestation) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                ATTESTATION_DOMAIN,
                block.chainid,
                address(this),
                address(token),
                routeId,
                attestation.sourceChainId,
                attestation.sourceBridge,
                attestation.operationId,
                attestation.recipient,
                attestation.amount,
                attestation.expiresAt
            )
        );
    }

    function attestAndMint(MintAttestation calldata attestation, bytes[] calldata signatures) external {
        if (
            attestation.sourceChainId == 0 || attestation.sourceBridge == bytes32(0)
                || attestation.operationId == bytes32(0) || attestation.recipient == address(0)
                || attestation.amount == 0
        ) revert InvalidAttestation();
        if (block.timestamp > attestation.expiresAt) revert AttestationExpired();
        if (consumedOperation[attestation.operationId]) revert AlreadyConsumed(attestation.operationId);
        if (signatures.length < threshold) revert InsufficientSignatures();

        bytes32 messageDigest = digest(attestation);
        address[] memory signers = new address[](signatures.length);
        uint256 validSignatures;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(messageDigest, signatures[i]);
            if (!isAttester[signer]) revert InvalidSignature();
            for (uint256 j = 0; j < validSignatures; j++) {
                if (signers[j] == signer) revert DuplicateSigner();
            }
            signers[validSignatures] = signer;
            validSignatures += 1;
        }
        if (validSignatures < threshold) revert InsufficientSignatures();

        // Effects before interaction. A failed token mint reverts consumption atomically.
        consumedOperation[attestation.operationId] = true;
        token.bridgeMint(attestation.recipient, attestation.amount);
        emit MintAttested(attestation.operationId, attestation.recipient, attestation.amount);
    }

    function _recover(bytes32 messageDigest, bytes calldata signature) private pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        signer = ecrecover(messageDigest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
