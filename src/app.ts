import { Bot, session, InlineKeyboard } from 'grammy';
// import { run } from '@grammyjs/runner';
import { JsonDB, Config } from 'node-json-db';
import { checkAddress, scrap, scrapFullPage } from './scrapper';
import { ToadScheduler, SimpleIntervalJob, Task, AsyncTask } from 'toad-scheduler';
import { Menu } from '@grammyjs/menu';

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
    { command: 'set_district', description: 'Set which district to check' },
    { command: 'set_search_string', description: 'Set which address to check' },
    { command: 'notifications', description: 'Set whether to notify you or not' },
    { command: 'instructions', description: 'Send instructions on how to use the bot' },
]);

const menu = new Menu('district menu')
    .text('Saburtalo', async (ctx) => {
        if (ctx?.from?.id) {
            await db.push(`/users/${ctx.from.id}/district`, 'საბურთალოს რაიონი', true);
            ctx.reply('Successfully set Saburtalo as your district!');
        }
    })
    .row()
    .text('Vake', async (ctx) => {
        if (ctx?.from?.id) {
            await db.push(`/users/${ctx.from.id}/district`, 'ვაკის რაიონი', true);
            ctx.reply('Successfully set Vake as your district!');
        }
    })
    .row()
    .text('Gldani', async (ctx) => {
        if (ctx?.from?.id) {
            await db.push(`/users/${ctx.from.id}/district`, 'გლდანის რაიონი', true);
            ctx.reply('Successfully set Gldani as your district!');
        }
    });

bot.use(menu);

bot.command('start', async (ctx) => {
    await ctx.reply('Welcome to GWP Bot');
    await ctx.reply('Please set your address');
    if (ctx?.from?.id) {
        await db.push('/users/' + ctx.from.id, { address: '', notifications: false, district: '' }, true);
    }
});

bot.command('set_district', async (ctx) => {
    await ctx.reply('Please select your district:', { reply_markup: menu });
});

bot.command('set_search_string', async (ctx) => {
    await ctx.reply(`Please send a message in a following format: 'check for: *xxx*'`);
});

bot.hears(/check for: *(.+)?/, async (ctx) => {
    const address = ctx.match[1];
    if (ctx?.from?.id) {
        await db.push('/users/' + ctx.from.id + '/address', address, true);
    }
    await ctx.reply(`Your address is set to ${address}`);
});

bot.command('check', async (ctx, next) => {
    await ctx.reply('Checking...');
    const address = await db.getData('/users/' + ctx.from?.id + '/address');
    const district = await db.getData('/users/' + ctx.from?.id + '/district');
    if (!address) {
        await ctx.reply('Please set your address first');
    } else {
        const result = await scrap(address, district);
        await ctx.reply(`${result.parseResultFormatted}. Visit ${result.waterShortageUrl} to find out more`);
    }
    await next();
});

bot.start();

const scrapForUpdates = async () => {
    const allInfoArray = await scrapFullPage();
    const oldInfoArray = await db.getData('/districtArray');
    // check if these arrays are equal
    if (JSON.stringify(allInfoArray) !== JSON.stringify(oldInfoArray)) {
        await db.push('/districtArray', allInfoArray, true);
        return true;
    }
    return false;
};

const scrapForUpdatesTask = new AsyncTask('check for updates', async () => {
    const updated = await scrapForUpdates();
    await db.push('/shouldNotify', updated, true);
});

const notifyTask = new AsyncTask('check for updates', async () => {
    const shouldNotify = await db.getData('/shouldNotify');
    if (!shouldNotify) {
        return;
    }
    const users = await db.getData('/users');
    const scraped = await db.getData('/districtArray');
    const usersIdsArray = Object.keys(users);
    usersIdsArray.forEach(async (userId) => {
        const { address, district } = users[userId];
        const result = checkAddress({
            address,
            district,
            infoArray: scraped,
        });

        await bot.api.sendMessage(userId, `${result}. Visit gwp.ge/ka/gadaudebeli to find out more`);
    });
});

const notifyJob = new SimpleIntervalJob({ hours: 2, minutes: 5, runImmediately: true }, notifyTask, { id: 'id_1' });
const scrapeJob = new SimpleIntervalJob({ hours: 2, runImmediately: true }, scrapForUpdatesTask, { id: 'id_2' });

scheduler.addSimpleIntervalJob(scrapeJob);
scheduler.addSimpleIntervalJob(notifyJob);
