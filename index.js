const { Telegraf } = require('telegraf');
const moment = require('moment');

let db;
Promise.all([import('lowdb'), import('lowdb/node')]).then(
  ([{ LowSync }, { JSONFileSync }]) => {
    db = new LowSync(new JSONFileSync('db.json'), {
      unreadMsgs: [],
      lastInteraction: Math.floor(Date.now() / 1000),
    });
    db.read();
  }
);
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.launch();

bot.on('message', (ctx) => {
  if (ctx.message.chat.id !== Number(process.env.TG_GROUP_ID)) return;

  db.read();

  if (ctx.message.from.id !== Number(process.env.TG_USER_ID_MERCHE)) {
    db.data.unreadMsgs.push({
      id: ctx.message.message_id,
      when: ctx.message.date,
    });
    db.write();
    return;
  }

  db.data.lastInteraction = Math.floor(Date.now() / 1000);
  db.write();

  const replyId = ctx.message.reply_to_message?.message_id;
  if (!replyId) return;

  const index = db.data.unreadMsgs.findIndex((msg) => msg.id === replyId);
  if (index === -1) return;

  if (db.data.unreadMsgs[index].reminderId)
    bot.telegram
      .deleteMessage(
        process.env.TG_CHAT_ID_MERCHE,
        db.data.unreadMsgs[index].reminderId
      )
      .catch(() => {});

  if (db.data.unreadMsgs[index].urlId)
    bot.telegram
      .deleteMessage(
        process.env.TG_CHAT_ID_MERCHE,
        db.data.unreadMsgs[index].urlId
      )
      .catch(() => {});

  db.data.unreadMsgs.splice(index, 1);
  db.write();
});

async function remindUnread() {
  db.read();
  const { unreadMsgs, lastInteraction } = db.data;

  for (const msg of unreadMsgs) {
    const { id, when, reminderId, urlId } = msg;
    if (
      when > lastInteraction &&
      moment().diff(new Date(when * 1000), 'hours') < 10
    )
      continue;

    if (reminderId) {
      await bot.telegram
        .deleteMessage(process.env.TG_CHAT_ID_MERCHE, reminderId)
        .catch(() => {});
      await bot.telegram
        .deleteMessage(process.env.TG_CHAT_ID_MERCHE, urlId)
        .catch(() => {});
      msg.reminderId = null;
      msg.urlId = null;
      db.write();
    }

    const { message_id: messageId } = await bot.telegram.copyMessage(
      process.env.TG_CHAT_ID_MERCHE,
      process.env.TG_GROUP_ID,
      id,
      {
        disable_notification: moment().minute() > 11,
      }
    );
    const { message_id: newUrlId } = await bot.telegram.sendMessage(
      process.env.TG_CHAT_ID_MERCHE,
      `[Ir al mensaje](https://t.me/c/${process.env.TG_GROUP_ID.substring(
        4
      )}/${id})`,
      {
        parse_mode: 'Markdown',
        disable_notification: moment().minute() > 11,
      }
    );

    msg.reminderId = messageId;
    msg.urlId = newUrlId;
    db.write();
  }
}

setInterval(remindUnread, 10 * 60 * 1000);
setTimeout(remindUnread, 5 * 1000);
