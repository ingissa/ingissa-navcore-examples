const { getDefaultConfig } = require('expo/metro-config');

// The reference POC consumes Navcore through its declared npm dependencies.
// Do not add sibling SDK workspaces here: doing so makes Metro resolve local
// source paths that are absent from a clean consumer installation.
module.exports = getDefaultConfig(__dirname);
