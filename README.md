# Zero-Knowledge Proof Authentication Library

A JavaScript authentication library that demonstrates zero-knowledge proof concepts through a challenge-response authentication flow. The project is designed to explore how users can prove knowledge of a secret without directly transmitting the secret itself.

## Overview

Traditional authentication often relies on sending credentials or credential-derived values to a server. This project explores an alternative authentication approach using zero-knowledge proof concepts, challenge-response logic, timestamp validation, and secure verification workflows.

The library provides functions for proof generation and proof verification, allowing a client to create an authentication proof and a server to validate it without exposing the underlying secret.

## Features

- Challenge-response authentication flow
- Proof generation and verification
- Timestamp-based replay protection
- Secure authentication workflow design
- JavaScript/Node.js implementation
- Modular library-style structure
- Testing for valid and invalid authentication scenarios

## Technologies Used

- JavaScript
- Node.js
- Ed25519 digital signatures
- REST API concepts
- Git/GitHub

## Architecture

Client Application
      |
      | 1. Receives challenge from server
      v
Proof Generation Function
      |
      | 2. Generates proof using secret key, challenge, and timestamp
      v
Server Verification Function
      |
      | 3. Verifies proof using public key, challenge, and timestamp
      v
Authentication Result

## Testing

- Successful proof generation
- Valid proof verification
- Invalid proof rejection
- Incorrect challenge rejection
- Timestamp/replay validation
- Malformed proof handling

  
