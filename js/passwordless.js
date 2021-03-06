function randomString() {
    return "fake-id-" + Math.random().toString(36).substr(2)
}

function toBuffer(txt) {
    return Uint8Array.from(txt, c => c.charCodeAt(0))
}

function parseBuffer(buffer) {
    return String.fromCharCode(...new Uint8Array(buffer))
}

function toBase64(buffer) {
    return btoa(parseBuffer(buffer))
}

function parseBase64(txt) {
    return toBuffer(atob(txt))
}

function parseBase64url(txt) {
    return parseBase64(txt.replaceAll('-', '+').replaceAll('_', '/'))
}


function parseAttestation(attestationObject) {
    if(!window.cbor)
        return null

    console.debug("Decoding attestation")

    // https://w3c.github.io/webauthn/#sctn-attestation
    let att = cbor.decode(attestationObject)
    /*
     * attestation: {
     *   fmt: // vendor specific format of `attStmt`
     *   attStmt: // ...
     *   authData: https://w3c.github.io/webauthn/#authenticator-data
     *
     *
     *
     */


    console.debug(att)

    // Base64 example of attestationObject.authData
    // authData = parseBase64('SZYN5YgOjGh0NBcPZHZgW4/krrmihjLHmVzzuoMdl2NFAAAAAAAAAAAAAAAAAAAAAAAAAAAAIP+nd26ubd84m5vaSMMyqwbFQbt9Inz/nChP5TrlOiOdpAEDAzkBACBZAQCmYB3osd3rcOrmOKGbit3WfvpBGGsTQqtZOTSh9OFBLMtFrNHwS24qnwUH+sAJTYQlgNcLOAwW+43cxMVOki4sxulyPeJcCSRXMFd5WH7umiqnbjyCTOxmxcwXHYOoGLteWHe4Z83eUiaJpMv1nHew0qESTAvEKKPRBPZuSVotxaeVVU7wDYsm2GIDQsMv8EvHeskb9dEyzvpk85yxsKuXQfOPoHx5Ue+VfcE3yTz0k8Nxrs5yTCPNY7WL4rgOoINzJ31jcpqpBVdcfPZ8yNwDD4b0FbUxzjhWiFRHAt/3v1dP9LSkXfh7qlHB/5Ws/w6xppuBKLn3+Arl/aiRALqrIUMBAAE=')

    let authData = att.authData
    let credentialLength = authData.slice(53, 55)

    return {
        fmt: att.fmt,
        attStmt: att.attStmt,
        authData: {
            rpIdHash: authData.slice(0,32),
            flags: authData.slice(32,33),
            counter: authData.slice(33, 37),
            aaguid: authData.slice(37, 53),
            credentialLength: credentialLength,
            credentialId: authData.slice(55, 55+credentialLength),
            publicKey: authData.slice(55+credentialLength, authData.length) // probably breaks if extensions are invoked
        }
    }
}

async function getAuthType(isExternal) {
    if(isExternal)
        return "cross-platform"
    try {
        let available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        if(available)
            return "platform"
        else
            return "cross-platform"
    } catch(e) {
        // might happen due to some security policies
        // see https://w3c.github.io/webauthn/#sctn-isUserVerifyingPlatformAuthenticatorAvailable
        return null
    }
}

// given a string challenge, the base64 encoded version will be signed
export async function register(username, options) {
    const challenge = randomString() // normally a challenge generated by the server
    const userId = randomString() // normally an identifier generated by the server

    const creationOptions = {
        challenge: toBuffer(challenge),
        rp: {
            id: window.location.hostname,
            name: window.location.hostname
        },
        user: {
            id: toBuffer(userId),
            name: username,
            displayName: username,
        },
        pubKeyCredParams: [
            {alg: -8, type: "public-key"},   // (for some security keys)
            {alg: -7, type: "public-key"},   // ES-256 (Webauthn's default algorithm)
            {alg: -257, type: "public-key"}, // RS-256 (for Windows Hello and many others)
        ],
        //timeout: 60000,
        authenticatorSelection: {
            userVerification: "required",
            authenticatorAttachment: await getAuthType(options.isExternal),
        },
        //attestation: "direct"
    }

    console.debug(creationOptions)
    const credential = await navigator.credentials.create({publicKey: creationOptions});
    console.debug(credential)

    return {
        attestationRaw: toBase64(credential.response.attestationObject),
        attestation: parseAttestation(credential.response.attestationObject),
        clientData: parseBuffer(credential.response.clientDataJSON),
        userId: userId,
        credential: {
            id: credential.id,
            publicKey: toBase64(credential.response.getPublicKey()),
            algorithm: credential.response.getPublicKeyAlgorithm(),
            local: (credential.authenticatorAttachment === "platform")
        }
    }
}

// given a string challenge, the base64 encoded version will be signed
export async function login(username, credentialIds) {
    let challenge = randomString() // normally a challenge generated by the server

    let authOptions = {
        challenge: toBuffer(challenge),
        rpId: window.location.hostname,
        allowCredentials: [{
            id: parseBase64url(credentialIds[0]),
            type: 'public-key',
            //transports: ['usb', 'ble', 'nfc'],
        }],
        timeout: 60000,
    }

    console.debug(authOptions)
    let auth = await navigator.credentials.get({
        publicKey: authOptions
    })
    console.debug(auth)

    return {
        credentialId: auth.id,
        userId: parseBuffer(auth.response.userHandle),
        clientData: parseBuffer(auth.response.clientDataJSON),
        signature: toBase64(auth.response.signature),
        authenticatorData: toBase64(auth.response.authenticatorData)
    }
}
