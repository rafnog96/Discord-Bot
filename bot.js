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

let killedBosses = [];
// {bossId: NUMBER, killedTime: DATE.NOW, state: 1 -> kill, 2 -> poof},
// {}
let areaColors = {};

let areaNames = {};

function sortByChance(a, b) {
    // Sort by chance (descending order)
    if (a.State != 0 || b.State != 0){
      return a.State - b.State;
    }
    const trimmedChanceA = parseFloat(a.chance) || 0;
    const trimmedChanceB = parseFloat(b.chance) || 0;
    return  trimmedChanceB - trimmedChanceA;
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

async function updateAll() {
  const connection = await pool.promise().getConnection();
  Object.entries(areaBosses).forEach(([area, bosses]) => {
    bosses.forEach(async (boss) => {
      const boss_id = parseInt(boss.Id);
      const chance = boss.chance !== '' ? boss.chance : 'NULL';
      await connection.execute(`UPDATE Bosses SET State = 0, Chance = ${chance} WHERE id = ${boss_id};`);
      boss.State = 0;
    });
  });
}

async function addKillBoss(bossName, newState){
  const currentDateTime = new Date();
  killedBosses.push({bossName: bossName, time:currentDateTime, state: newState});
  const connection = await pool.promise().getConnection();
  await connection.execute(`INSERT INTO Boss_killed (boss, killed_time, state) VALUES ('${bossName}',CURRENT_TIMESTAMP,${newState}) ;`);
  return true; // Return true if boss is found and chance is updated
}

async function deleteKillBoss(bossName){
  const index = killedBosses.findIndex(row => row.bossName === bossName);
  if (index !== -1) killedBosses.splice(index, 1);
  const connection = await pool.promise().getConnection();
  await connection.execute(`DELETE FROM Boss_killed WHERE boss = '${bossName}' ;`);
  return true; // Return true if boss is found and chance is updated
}

async function updateState(id, newState) {
  const connection = await pool.promise().getConnection();
  const boss_id = parseInt(id);
  await connection.execute(`Update Bosses SET State = ${newState} WHERE id = ${boss_id};`);
  return true; // Return true if boss is found and chance is updated
}

function dailySchedule(hour, minute, second, callback) {
  const now = new Date();
  const targetTime = new Date();
  targetTime.setHours(hour, minute, second);

  // If the target time has already passed today, set it for tomorrow
  if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1);
  }

  const timeUntilNextExecution = targetTime - now;

  setTimeout(() => {
      callback();
      // Schedule next execution for the same time tomorrow
      dailySchedule(hour, minute, second, callback);
  }, timeUntilNextExecution);
}

function buildKilledMessage() {
  let killedMessage = 'Killed: \n';
  killedBosses.forEach(row => {
    const bossName = row.bossName;
    const time = row.time;
    const hours = time.getHours();
    const minutes = String(time.getMinutes()).padStart(2, '0');
    const state = row.state;
    let messageState = '✅'
    if (state != 1){
      messageState = '😶‍🌫️'
    }
    // Append information for each row to the message content
    killedMessage += `${messageState} ${bossName} ${hours}:${minutes}\n`;
  });
  return killedMessage;
}

const lastClickedTimes = new Map();

let intervalId;

let dailyMessage;

client.once("ready", async () => {
  console.log("The bot is now connected and ready.");
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);
  const localOffset = new Date().getTimezoneOffset() * 60 * 1000;
  try {
    // Fetch data using the fetchData function
    const areas = await fetchData('Areas');
    const bosses = await fetchData('Bosses');
    const message = await fetchData('Message');
    const killed = await fetchData('Boss_killed');
    killed.forEach((eachKilled) => {
      killedBosses.push({bossName: eachKilled.boss, time: eachKilled.killed_time, state: eachKilled.state})
    })
    dailyMessage = message[0].message_id;
    killedMessage = buildKilledMessage();
    if (dailyMessage == ""){
      const channel = await client.channels.fetch(process.env.DISCORD_MESSAGE_CHANNEL);
      const message = await channel.send(killedMessage);
      const connection = await pool.promise().getConnection();
      await connection.execute(`UPDATE Message SET message_id = ${message.id} WHERE id = 1;`);
    } else {
      const channel = await client.channels.fetch(process.env.DISCORD_MESSAGE_CHANNEL);
      const message = await channel.messages.fetch(dailyMessage);
      message.edit(killedMessage);
    }
    areas.forEach((area) =>{
      let areabosses = [];
      bosses.forEach((boss) =>{
        if (boss.Bossarea == area.Id){
          var lastCheck = new Date(boss.Last_check);
          lastCheck.setTime(lastCheck.getTime() - localOffset); 
          areabosses.push({Id: boss.Id.toString(), bossName: boss.Bossname, searchName: boss.Searchname, chance: boss.Chance ?? "", State: boss.State,  lastCheck: lastCheck, stage: boss.Stage})
        }
      })
      areaColors[area.Name] = area.Color;
      areaNames[area.Id] = area.Name;
      areaBosses[area.Name] = areabosses;
    })
    Object.values(areaBosses).forEach(bosses => {
      bosses.sort(sortByChance);
    });
    createEntries(channel);
    startInterval(channel);
    dailySchedule(10,35,0, async () => {
      await scrapeSite();
      await updateAll();
      const connection = await pool.promise().getConnection();
      await connection.execute('DELETE FROM Boss_killed WHERE killed_time < DATE_SUB(NOW(), INTERVAL 31 HOUR);')
      const killed = await fetchData('Boss_killed');
      killedBosses = [];
      killed.forEach((eachKilled) => {
        killedBosses.push({bossName: eachKilled.boss, time: eachKilled.killed_time, state: eachKilled.state})
      })
      const killedMessage = buildKilledMessage();
      const channel = await client.channels.fetch(process.env.DISCORD_MESSAGE_CHANNEL);
      const message = await channel.send(killedMessage);
      await connection.execute(`UPDATE Message SET message_id = ${message.id} WHERE id = 1;`);
      // This code will be executed at 12:00:00 PM every day
    })
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
  const customChance = boss.chance !== '' ? "[" + boss.chance + "%]" : "";
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
    .setLabel(`${boss.bossName} ${customChance} ${indicator}`)
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
        Object.values(areaBosses).forEach(bosses => {
          bosses.sort(sortByChance);
      });
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
      }, MINUTE); 
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
                      boss.chance = text.slice(0,-1);
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
    const bossName = args.join(' '); // Assume the rest is the boss name
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);

    if (message.channelId !== channel.id){
      return
    }

    if (command === 'clear') {
      stopInterval();
      await message.delete();
      const fetched = await message.channel.messages.fetch({ limit: 50 });
      await message.channel.bulkDelete(fetched);
      await createEntries(channel);
      startInterval(channel);
    }
    else if (command === 'info') {
      await scrapeSite();
      await updateAll();
    }
    else if (command === 'kill' && bossName) {
      await updateBossState(bossName, 1, message, channel); // Killed
      Object.values(areaBosses).forEach(bosses => {
        bosses.sort(sortByChance);
    });
    } else if (command === 'poof' && bossName) {
      await updateBossState(bossName, 2, message, channel); // Poofed
      Object.values(areaBosses).forEach(bosses => {
        bosses.sort(sortByChance);
    });
    } else if (command === 'mistake' && bossName) {
      await updateBossState(bossName, 0, message, channel); // Reset to default
      Object.values(areaBosses).forEach(bosses => {
        bosses.sort(sortByChance);
    });
    }
});

async function updateBossState(bossName, newState, message, channel) {
  const area = Object.keys(areaBosses).find(area => 
      areaBosses[area].some(boss => boss.bossName === bossName)
  );
  if (!area) {
      if (newState == 0){
        deleteKillBoss(bossName)
      } else {
        addKillBoss(bossName, newState);
      }
      const nonBossMessage = await message.reply('Not listed boss was killed.');
      setTimeout(() => {
        nonBossMessage.delete(); // Delete after 10 seconds
        message.delete();
      }, 5000);
      const killedMessage = buildKilledMessage();
      const channel_for_notify = await client.channels.fetch(process.env.DISCORD_MESSAGE_CHANNEL);
      const message_notify = await channel_for_notify.messages.fetch(dailyMessage);
      message_notify.edit(killedMessage);
      return;
  } 

  const bosses = areaBosses[area].map(boss => {
      if (boss.bossName === bossName) {
          boss.State = newState;
          updateState(boss.Id, newState);
          if (newState == 0){
            deleteKillBoss(bossName);
          } else {
            addKillBoss(bossName, newState);
          }
      }
      return boss;
  });
  stopInterval(); // Stop updates while editing
  const actionRows = createActionRows(bosses);
  const messages = await channel.messages.fetch({ limit: 100 });
  const areaMessage = messages.find(m => m.embeds[0]?.title.startsWith(`**${area} Bosses**`));
  if (areaMessage) {
      await areaMessage.edit({ components: actionRows });
  }
  startInterval(channel); // Restart updates
  const confirmationMessage = await message.reply(`${bossName} status updated.`);
  setTimeout(() => {
    confirmationMessage.delete(); // Delete after 10 seconds
    message.delete();
  }, 5000);
  const killedMessage = buildKilledMessage();
  const channel_for_notify = await client.channels.fetch(process.env.DISCORD_MESSAGE_CHANNEL);
  const message_notify = await channel_for_notify.messages.fetch(dailyMessage);
  message_notify.edit(killedMessage);
};

client.login(process.env.DISCORD_TOKEN);
