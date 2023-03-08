const replace = require('@rollup/plugin-replace');

module.exports = {
  // This function will run for each entry/format/env combination
  rollup(config, options) {
    config.plugins = config.plugins.map((p) => {
      if (p?.name === 'replace') {
        return replace({
          preventAssignment: true,
          'process.env.NODE_ENV': JSON.stringify(options.env),
        });
      }
      return p;
    });

    return config; // always return a config.
  },
};
