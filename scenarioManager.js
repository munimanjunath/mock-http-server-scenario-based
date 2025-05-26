const logger = require('./logger');

let currentScenario = 'default';

module.exports = {
  getScenario: () => {
    logger.debug('Getting current scenario', { scenario: currentScenario });
    return currentScenario;
  },
  
  setScenario: (scenario) => {
    const previousScenario = currentScenario;
    currentScenario = scenario;
    logger.info('Scenario changed', { 
      from: previousScenario, 
      to: currentScenario,
      timestamp: new Date().toISOString()
    });
    return currentScenario;
  }
};