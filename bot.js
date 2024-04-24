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

const mysql = require('mysql2');
process.env.DISCORD_CHANNEL
// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_ADDRESS,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 's129935_boss-checks',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const MINUTE = 60000;

let areaBosses = {};
// let areaBosses = {
//     "MWC": [
//       { Id: 1, bossName: "Furyosa", searchName: "Furyosa", chance: "" ,stage: "", state: "0"},
//       { Id: 1, bossName: "Robbers (Checked Board)", searchName: "", chance: "" ,stage: "", state: "0"}
//     ],
//   };

let killedBosses = [];
// {bossId: NUMBER, killedTime: DATE.NOW, state: 1 -> kill, 2 -> poof},
// {}
let areaColors = {};

let areaNames = {};

function sortByChance(a, b) {
    const trimmedChanceA = parseFloat(a.chance.slice(1, -2)) || 0;
    const trimmedChanceB = parseFloat(b.chance.slice(1, -2)) || 0;
    
    return trimmedChanceB - trimmedChanceA;
}

async function fetchData(table) {
  try {
    // Get a connection from the pool
    const connection = await pool.promise().getConnection();
    
    // Execute the query
    const [rows, fields] = await connection.execute(`SELECT * FROM ${table}`);
    
    // Release the connection back to the pool
    connection.release();
    
    // Return the fetched data
    return rows;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error; // Rethrow the error for handling in the caller function
  }
}

async function updateCheck(id) {
  for (const area in areaBosses) {
      if (areaBosses.hasOwnProperty(area)) {
          const bosses = areaBosses[area];
          const bossToUpdate = bosses.find(boss => boss.Id === id);
          if (bossToUpdate) {
              const localTimeStamp = Date.now(); // Get the current time in milliseconds
              bossToUpdate.lastCheck = localTimeStamp;
              const connection = await pool.promise().getConnection();
              const boss_id = parseInt(id);
              await connection.execute(`Update Bosses SET Last_check = CURRENT_TIMESTAMP WHERE id = ${boss_id};`);
              return true; // Return true if boss is found and chance is updated
          }
      }
  }
  return false; // Return false if boss with given Id is not found
}

const lastClickedTimes = new Map();

let intervalId;

client.once("ready", async () => {
  console.log("The bot is now connected and ready.");
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);
  const localOffset = new Date().getTimezoneOffset() * 60 * 1000;
  try {
    // Fetch data using the fetchData function
    const areas = await fetchData('Areas');
    const bosses = await fetchData('Bosses');
    areas.forEach((area) =>{
      let areabosses = [];
      bosses.forEach((boss) =>{
        if (boss.Bossarea == area.Id){
          var lastCheck = new Date(boss.Last_check);
          // lastCheck.setTime(lastCheck.getTime() + (2 * 60 * 60 * 1000)); 
          areabosses.push({Id: boss.Id.toString(), bossName: boss.Bossname, searchName: boss.Searchname, chance: boss.Chance ?? "", State: boss.State,  lastCheck: lastCheck, stage: boss.Stage})
        }
      })
      areaColors[area.Name] = area.Color;
      areaNames[area.Id] = area.Name;
      areaBosses[area.Name] = areabosses;
    })
    createEntries(channel);
    startInterval(channel);
  } catch (error) {
    console.error('An error occurred:', error);
  }
});

function getIndicator(elapsed, boss) {
  if (boss.stage == 1) {
    if (elapsed >= 90 * MINUTE && elapsed < 180 * MINUTE) return {indicator: "❕", buttonStyle: ButtonStyle.Primary};
    if (elapsed >= 180 * MINUTE && elapsed < 240 * MINUTE) return {indicator: "❗", buttonStyle: ButtonStyle.Primary};
    if (elapsed >= 240 * MINUTE) return {indicator: "⏰", buttonStyle: ButtonStyle.Danger};;
  } else {
    if (elapsed >= 20 * MINUTE && elapsed < 40 * MINUTE) return {indicator: "❕", buttonStyle: ButtonStyle.Primary}; // 20 mins to <40 mins
    if (elapsed >= 40 * MINUTE && elapsed < 60 * MINUTE) return {indicator: "❗", buttonStyle: ButtonStyle.Primary}; // 40 mins to <1 hour
    if (elapsed >= 60 * MINUTE) return {indicator: "⏰", buttonStyle: ButtonStyle.Danger}; // 1 hour+
  }
  return {indicator: "", buttonStyle: ButtonStyle.Success}
}

function createButton(boss) {
  const localTimeStamp = Date.now(); // Get the current time in milliseconds
  const elapsed = localTimeStamp - boss.lastCheck;
  const {indicator, buttonStyle} = getIndicator(elapsed, boss);
  if (boss.State == 1){
    return new ButtonBuilder()
    .setCustomId(boss.Id)
    .setLabel(`${boss.bossName} ${"☠️"}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  }
  else if (boss.State == 2){
    return new ButtonBuilder()
    .setCustomId(boss.Id)
    .setLabel(`${boss.bossName} ${"☁️"}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);
  }
  return new ButtonBuilder()
    .setCustomId(boss.Id)
    .setLabel(`${boss.bossName} ${boss.chance} ${indicator}`)
    .setStyle(buttonStyle);
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
  const messages = await channel.messages.fetch({ limit: 20 });
  let iterator = 0;
  Object.entries(areaBosses).forEach(([area, bosses]) => {
    messages.find((m) => {
      const found = m.embeds?.[0]?.title?.startsWith(`**${area} Bosses**`);
      if (found) {
        iterator++;
      }
      return found;
    });
  });
  if (iterator != Object.keys(areaColors).length){
    Object.entries(areaBosses).forEach(([area, bosses]) => {
      bosses.forEach((boss) => {
        lastClickedTimes.set(boss.bossName, new Date()); // Initialize last clicked times
      });
      const actionRows = createActionRows(bosses);
      let decimalColor = 0;
      if (areaColors[area]){
        decimalColor = parseInt(areaColors[area].substring(2), 16);
      }
      const embed = new EmbedBuilder()
        .setColor(decimalColor)
        .setTitle(`**${area} Bosses**`);
      channel.send({ embeds: [embed], components: actionRows });
    });
  }
}

function startInterval(channel) {
    intervalId = setInterval(async () => {
        Object.entries(areaBosses).forEach(async ([area, bosses]) => {
            const messages = await channel.messages.fetch({ limit: 20 });
            const areaMessage = messages.find((m) => {
                return m.embeds?.[0]?.title?.startsWith(`**${area} Bosses**`);
            });
            if (areaMessage) {
                const actionRows = createActionRows(bosses);
                areaMessage.edit({ components: actionRows });
          }
        });
      }, MINUTE/10); 
}

function stopInterval() {
    if (intervalId) {
        clearInterval(intervalId);
    }
}

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.deferred || interaction.replied) return;

    const bossId = interaction.customId;
    updateCheck(bossId);

    const area = Object.keys(areaBosses).find(area =>
    areaBosses[area].some(boss => boss.Id === bossId)
    );
    if (area){
        stopInterval();
        const actionRows = createActionRows(areaBosses[area]);
        await interaction.update({ components: actionRows });
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);
        startInterval(channel);
    }
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
                if (boss.searchName && tdElements.length > 1 && $(tdElements[1]).text().trim() === boss.searchName) {
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
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);

    if (message.content === '!clear' && message.channelId === channel.id) {
        stopInterval();
        await message.delete();
        const fetched = await message.channel.messages.fetch({ limit: 50 });
        await message.channel.bulkDelete(fetched);
        await createEntries(channel);
        startInterval(channel);
    }
    if (message.content === '!info' && message.channelId === channel.id) {
        scrapeSite();
    }
    // await message.delete(); -> will delete message which was sended 
    // !kill FOrermean -> NOT WORK
    // !kill Foreman -> Will work
   // !kill Foreman -> Foreman areaBosses -> state: 1
   // !poof Foreman -> Foreman areaBosses -> state: 2
   // !mistake Foreman -> Foreman areaBosses -> state: 0
});

client.login(process.env.DISCORD_TOKEN);
