const getLaunchesHandler = require('./getLaunches.js')
const queryLaunchesHandler = require('./queryLaunches.js')
const saveToStorageHandler = require('./saveToStorage.js')
const getLaunchByIdHandler = require('./getLaunchById.js')
const getEventsHandler = require('./getEvents.js')
const getAgenciesHandler = require('./getAgencies.js')
const getLaunchersHandler = require('./getLaunchers.js')
const queryEventsHandler = require('./queryEvents.js')
const queryAgenciesHandler = require('./queryAgencies.js')
const queryLaunchersHandler = require('./queryLaunchers.js')

const actionMap = {
    getLaunches: getLaunchesHandler,
    queryLaunches: queryLaunchesHandler,
    saveToStorage: saveToStorageHandler,
    getLaunchById: getLaunchByIdHandler,
    getEvents: getEventsHandler,
    getAgencies: getAgenciesHandler,
    getLaunchers: getLaunchersHandler,
    queryEvents: queryEventsHandler,
    queryAgencies: queryAgenciesHandler,
    queryLaunchers: queryLaunchersHandler,
}

module.exports = async (ctx) => {
    if (ctx.args?.deploy_test === true) {
        return "v1.3"
    }

    console.log('ctx:', JSON.stringify(Object.keys(ctx)));
    console.log('ctx.args:', JSON.stringify(ctx.args));
    console.log('ctx.query:', JSON.stringify(ctx.query));
    console.log('ctx.body:', JSON.stringify(ctx.body));
    console.log('ctx.params:', JSON.stringify(ctx.params));

    let action = ctx.args?.unionAction || 
                 ctx.query?.unionAction || 
                 ctx.body?.unionAction || 
                 ctx.params?.unionAction ||
                 ctx.args?.query?.unionAction;

    if (!action) {
        return { errMsg: 'no action specified', ok: false, debug: { args: ctx.args, query: ctx.query, body: ctx.body } }
    }

    const handler = actionMap[action]
    if (!handler) {
        return { errMsg: `unknown action: ${action}`, ok: false }
    }

    return await handler(ctx)
};