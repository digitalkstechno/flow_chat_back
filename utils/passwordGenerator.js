const crypto = require('crypto');

function generateStrongPassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
    let password = '';
    // Ensure at least one of each required character type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[crypto.randomInt(26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[crypto.randomInt(26)];
    password += '0123456789'[crypto.randomInt(10)];
    password += '!@#$%^&*()_+~`|}{[]:;?><,./-='[crypto.randomInt(29)];

    for (let i = 4; i < length; i++) {
        password += charset[crypto.randomInt(charset.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
}

module.exports = { generateStrongPassword };
