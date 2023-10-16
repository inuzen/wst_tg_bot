import { Bot, session, InlineKeyboard } from 'grammy';
// import { run } from '@grammyjs/runner';
import { JsonDB, Config } from 'node-json-db';
import { scrap } from './scrapper';
import { ToadScheduler, SimpleIntervalJob, Task, AsyncTask } from 'toad-scheduler';

const scheduler = new ToadScheduler();
require('dotenv').config();

const token = process.env.BOT_TOKEN;
if (token === undefined) {
    throw new Error('BOT_TOKEN must be provided!');
}

var db = new JsonDB(new Config('db', true, false, '/'));

const bot = new Bot(token);

bot.api.setMyCommands([
    { command: 'check', description: 'Check if your address is mentioned today' },
    { command: 'set_search_string', description: 'Set which address to check' },
    { command: 'notifications', description: 'Set whether to notify you or not' },
    { command: 'instructions', description: 'Send instructions on how to use the bot' },
]);

bot.command('start', async (ctx) => {
    await ctx.reply('Welcome to GWP Bot');
    await ctx.reply('Please set your address');
    if (ctx?.from?.id) {
        await db.push('/' + ctx.from.id, { address: '', notifications: false, lastResult: '' }, true);
    }
});

bot.command('set_search_string', async (ctx) => {
    await ctx.reply(`Please send a message in a following format: 'check for: *xxx*'`);
});

bot.hears(/check for: *(.+)?/, async (ctx) => {
    const address = ctx.match[1];
    if (ctx?.from?.id) {
        await db.push('/' + ctx.from.id + '/address', address, true);
    }
    await ctx.reply(`Your address is set to ${address}`);
});

bot.command('check', async (ctx, next) => {
    await ctx.reply('Checking...');
    const address = await db.getData('/' + ctx.from?.id + '/address');
    if (!address) {
        await ctx.reply('Please set your address first');
    } else {
        const result = await scrap(address);
        await db.push('/' + ctx.from?.id + '/lastResult', result.parseResultFormatted, true);
        await ctx.reply(`${result.parseResultFormatted}. Visit ${result.waterShortageUrl} to find out more`);
    }
    await next();
});

bot.start();

const task = new AsyncTask('check for updates', async () => {
    const data = await db.getData('/');
    const usersIdsArray = Object.keys(data);
    usersIdsArray.forEach(async (userId) => {
        const { address, lastResult } = data[userId];
        const result = await scrap(address);
        if (result.parseResultFormatted !== lastResult) {
            await db.push('/' + userId + '/lastResult', result.parseResultFormatted, true);
            await bot.api.sendMessage(
                userId,
                `${result.parseResultFormatted}. Visit ${result.waterShortageUrl} to find out more`,
            );
        }
    });
});

const job1 = new SimpleIntervalJob({ hours: 2, runImmediately: true }, task, { id: 'id_1' });

scheduler.addSimpleIntervalJob(job1);
