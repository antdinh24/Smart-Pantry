/**
 * __mocks__/react-native-vector-icons.js
 *
 * react-native-vector-icons uses native font files that don't exist in Jest's
 * Node.js environment. This mock replaces every icon component with a plain
 * React Native Text element so tests can render screens without crashing.
 *
 * Jest resolves this file automatically for any import matching
 * "react-native-vector-icons/*" via the moduleNameMapper in package.json.
 */
const React = require('react');
const { Text } = require('react-native');

const Icon = ({ name, testID, ...props }) =>
  React.createElement(Text, { testID: testID || `icon-${name}`, ...props }, name);

module.exports = Icon;
module.exports.default = Icon;
