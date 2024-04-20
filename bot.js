const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
require("dotenv").config();

const axios = require('axios');
const cheerio = require('cheerio');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const MINUTE = 60000;

let areaBosses = {
    "MWC": [
      { bossName: "Furyosa", searchName: "Furyosa", chance: "" },
      { bossName: "Robbers (Checked Board)", searchName: "", chance: "" }
    ],
    "Free Account Areas": [
      { bossName: "Foreman", searchName: "Foreman Kneebiter", chance: "" },
      { bossName: "Grorlam", searchName: "", chance: "" },
      { bossName: "The Evil Eye", searchName: "The Evil Eye", chance: "" },
      { bossName: "Xenia", searchName: "Xenia", chance: "" },
      { bossName: "Zarabustor", searchName: "Zarabustor", chance: "" },
      { bossName: "Zevelon", searchName: "Zevelon Duskbringer", chance: "" },
      { bossName: "Warlord Ruzad", searchName: "Warlord Ruzad", chance: "" },
      { bossName: "Rukor Zad", searchName: "Rukor Zad", chance: "" },
      { bossName: "Dharalion", searchName: "Dharalion", chance: "" },
      { bossName: "Frog Prince", searchName: "The Frog Prince", chance: "" },
      { bossName: "General Murius", searchName: "General Murius", chance: "" },
      { bossName: "Yaga", searchName: "Yaga The Crone", chance: "" }
    ],
    "PoI": [
      { bossName: "Countess", searchName: "Countess Sorrow", chance: "" },
      { bossName: "Hand", searchName: "The Handmaiden", chance: "" },
      { bossName: "Imp", searchName: "The Imperor", chance: "" },
      { bossName: "Punish", searchName: "Mr. Punish", chance: "" },
      { bossName: "Massacre", searchName: "Massacre", chance: "" },
      { bossName: "Plasmother", searchName: "The Plasmother", chance: "" },
      { bossName: "Dracola", searchName: "Dracola", chance: "" }
    ],
    "Edron, Darama & Port Hope": [
      { bossName: "Arachir", searchName: "Arachir The Ancient One", chance: "" },
      { bossName: "Gravelord", searchName: "Gravelord Oshuran", chance: "" },
      { bossName: "Tzumruh", searchName: "Tzumrah The Dazzler", chance: "" },
      { bossName: "Captain Jones", searchName: "Captain Jones", chance: "" },
      { bossName: "Shlorg", searchName: "Shlorg", chance: "" },
      { bossName: "Big Bad One", searchName: "The Big Bad One", chance: "" },
      { bossName: "Valor", searchName: "Sir Valorcrest", chance: "" },
      { bossName: "Trollvier", searchName: "Big Boss Trolliver", chance: "" },
      { bossName: "Smuggler", searchName: "Smuggler Baron Silvertoe	", chance: "" },
      { bossName: "Cobrasss", searchName: "High Templar Cobrass", chance: "" },
      { bossName: "Oodok & Arthom", searchName: "", chance: "" },
      { bossName: "Welter", searchName: "The Welter", chance: "" },
      { bossName: "Hairman", searchName: "Hairman The Huge", chance: "" },
      { bossName: "Old Whopper", searchName: "The Old Whopper", chance: "" }
    ],
    "Svar, Liberty Bay & others": [
      { bossName: "Diblis", searchName: "Diblis The Fair", chance: ""     },
      { bossName: "Tyrn (LB)", searchName: "", chance: "" },
      { bossName: "Grandfather", searchName: "Grandfather Tridian", chance: "" },
      { bossName: "Man In The Cave", searchName: "man in the cave", chance: "" },
      { bossName: "Ocyakao", searchName: "Ocyakao", chance: "" },
      { bossName: "Hirintor (Nibelor)", searchName: "", chance: "" },
      { bossName: "Hirintor (Mines)", searchName: "", chance: "" },
      { bossName: "Barbaria", searchName: "Barbaria", chance: "" },
      { bossName: "Zushuka", searchName: "Zushuka", chance: "" },
      { bossName: "Omrafir", searchName: "Omrafir", chance: "" }
    ],
    "Zao": [
      { bossName: "Flea (NW Cave)", searchName: "", chance: "" },
      { bossName: "Flea (SW Cave)", searchName: "", chance: "" },
      { bossName: "Flea (Surface)", searchName: "", chance: "" },
      { bossName: "Hatebreeder", searchName: "", chance: "" },
      { bossName: "Flamecaller (Temple)", searchName: "", chance: "" },
      { bossName: "Flamecaller (Mountain)", searchName: "", chance: "" },
      { bossName: "Battlemaster Zunzu", searchName: "", chance: "" },
      { bossName: "Dreadmaw(s)", searchName: "", chance: "" },
      { bossName: "Voice(s)", searchName: "", chance: "" },
      { bossName: "All Zao", searchName: "", chance: "" }
    ],
    "Rotworms": [
      { bossName: "Rot Queen (Edron)", searchName: "", chance: "" },
      { bossName: "Rot Queen (Hellgate)", searchName: "", chance: "" },
      { bossName: "Rot Queen (LB)", searchName: "", chance: "" },
      { bossName: "Rot Queen (Dara)", searchName: "", chance: "" },
      { bossName: "White Pale (Edron)", searchName: "", chance: "" },
      { bossName: "White Pale (LB)", searchName: "", chance: "" },
      { bossName: "White Pale (Dara)", searchName: "", chance: "" }
    ]
  };
  

const areaColors = {
  MWC: 0xffd700,
  "Free Account Areas": 0xffc0cb,
  PoI: 0xff0000,
  "Edron, Darama & Port Hope": 0x008000,
  "Svar, Liberty Bay & others": 0x800080,
  Zao: 0xffa500,
  Rotworms: 0x00ffff,
};

function sortByChance(a, b) {
    const trimmedChanceA = parseFloat(a.chance.slice(1, -2)) || 0;
    const trimmedChanceB = parseFloat(b.chance.slice(1, -2)) || 0;
    
    return trimmedChanceB - trimmedChanceA;
}

const lastClickedTimes = new Map();

let intervalId;

client.once("ready", async () => {
  console.log("The bot is now connected and ready.");
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);

  createEntries(channel);
  startInterval(channel);
});

function getIndicator(elapsed, bossName) {
  if (areaBosses["PoI"].includes(bossName)) {
    if (elapsed >= 90 * MINUTE && elapsed < 180 * MINUTE) return "❕";
    if (elapsed >= 180 * MINUTE && elapsed < 240 * MINUTE) return "❗";
    if (elapsed >= 240 * MINUTE) return "⏰";
  } else {
    if (elapsed >= 20 * MINUTE && elapsed < 40 * MINUTE) return "❕"; // 20 mins to <40 mins
    if (elapsed >= 40 * MINUTE && elapsed < 60 * MINUTE) return "❗"; // 40 mins to <1 hour
    if (elapsed >= 60 * MINUTE) return "⏰"; // 1 hour+
  }
  return "";
}

function getButtonStyle(elapsed, bossName) {
    if (areaBosses["PoI"].includes(bossName)) {
        if (elapsed >= 240 * MINUTE) return ButtonStyle.Danger
    } else {
        if (elapsed >= 60 * MINUTE) return ButtonStyle.Danger
    }
    return ButtonStyle.Success
}

function createButton(boss) {
  const elapsed = Date.now() - lastClickedTimes.get(boss.bossName).getTime();
  const indicator = getIndicator(elapsed, boss.bossName);
  const style = getButtonStyle(elapsed, boss.bossName);
  return new ButtonBuilder()
    .setCustomId(boss.bossName.replace(/\s+/g, "_"))
    .setLabel(`${boss.bossName} ${boss.chance} ${indicator}`)
    .setStyle(style);
}

function createActionRows(bosses) {
  const actionRows = [];
  let actionRow = new ActionRowBuilder();
  bosses.forEach((boss, index) => {
    actionRow.addComponents(createButton(boss));
    if ((index + 1) % 5 === 0) {
      actionRows.push(actionRow);
      actionRow = new ActionRowBuilder();
    }
  });
  if (actionRow.components.length > 0) {
    actionRows.push(actionRow);
  }
  return actionRows;
}

async function createEntries(channel){
    Object.entries(areaBosses).forEach(([area, bosses]) => {
        bosses.forEach((boss) => {
          lastClickedTimes.set(boss.bossName, new Date()); // Initialize last clicked times
        });
        const actionRows = createActionRows(bosses);
        const embed = new EmbedBuilder()
          .setColor(areaColors[area])
          .setTitle(`**${area} Bosses**`);
        channel.send({ embeds: [embed], components: actionRows });
      });
}

async function startInterval(channel) {
    intervalId = setInterval(async () => {
        Object.entries(areaBosses).forEach(async ([area, bosses]) => {
          const actionRows = createActionRows(bosses);
          const messages = await channel.messages.fetch({ limit: 100 });
          const areaMessage = messages.find((m) => {
            return m.embeds?.[0]?.title?.startsWith(`**${area} Bosses**`);
        });
          if (areaMessage) {
            areaMessage.edit({ components: actionRows });
          }
        });
      }, MINUTE/2); 
}

function stopInterval() {
    if (intervalId) {
        clearInterval(intervalId);
    }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.deferred || interaction.replied) return;

  const bossName = interaction.customId.replace(/_/g, " ");
  const now = new Date();
  lastClickedTimes.set(bossName, now);

  const area = Object.keys(areaBosses).find(area =>
    areaBosses[area].some(boss => boss.bossName === bossName)
);
  const actionRows = createActionRows(areaBosses[area]);
  await interaction.update({ components: actionRows });
});

async function scrapeSite() {
	const url = `https://guildstats.eu/bosses?world=Nevia&monsterName=&bossType=3&rook=0`;
	const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Find all <tr> elements
    $('tr').each((index, tr) => {
        // Find all <td> elements within the current <tr> element
        const tdElements = $(tr).find('td');
        Object.entries(areaBosses).forEach(([area, bosses]) => {
            bosses.forEach((boss) => {
                if (tdElements.length > 1 && $(tdElements[1]).text().trim() === boss.searchName) {
                    const text = $(tdElements[10]).text().trim();
                    if (text.includes("%")) {
                        boss.chance = "[" + text + "]";
                    }
                    else {
                        boss.chance = "";
                    }
                }
            });
        });
    });
    Object.values(areaBosses).forEach(bosses => {
        bosses.sort(sortByChance);
    });
	return
}

const prefix = '!';

client.on('messageCreate', async message => {
    // Ignore messages from bots and messages that don't start with the prefix
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    // Split the message into command and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);

    // Check if the command is 'ping'
    if (message.content === '!clear' && message.channelId === channel.id) {
        stopInterval();
        await message.delete();
        const fetched = await message.channel.messages.fetch({ limit: 100 });
        await message.channel.bulkDelete(fetched);
        await createEntries(channel);
        await startInterval(channel);
    }
    if (message.content === '!info' && message.channelId === channel.id) {
        scrapeSite();
    }
    
});

client.login(process.env.DISCORD_TOKEN);
