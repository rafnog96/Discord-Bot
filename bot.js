import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import "dotenv/config";

import { CronJob } from "cron";

import { stages, MINUTE, actionTypes } from "./data_const.js";

import axios from "axios";
import cheerio from "cheerio";
import moment from "moment";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

import mysql from "mysql2/promise";
// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_ADDRESS,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

let areaBosses = {};

let killedBosses = [];
// {bossId: NUMBER, killedTime: DATE.NOW, state: 1 -> kill, 2 -> poof},

let areaColors = {};

let areaNames = {};

function sortByChance(a, b) {
  // Sort by chance (descending order)
  if (a.State != 0 || b.State != 0) {
    return a.State - b.State;
  }

  const trimmedChanceA = parseFloat(a.chance) || 0;
  const trimmedChanceB = parseFloat(b.chance) || 0;
  return trimmedChanceB - trimmedChanceA;
}

async function fetchData(table) {
  try {
    // Get a connection from the pool
    const connection = await pool.getConnection();

    // Execute the query
    const [rows, fields] = await connection.execute(`SELECT * FROM ${table}`);

    // Release the connection back to the pool
    connection.release();

    // Return the fetched data
    return rows;
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error; // Rethrow the error for handling in the caller function
  }
}

async function fetchLogs() {
  try {
    // Get a connection from the pool
    const connection = await pool.getConnection();

    // Execute the query
    const [rows, fields] = await connection.execute(
      `SELECT * FROM Logs ORDER BY id DESC LIMIT 15`
    );

    // Release the connection back to the pool
    connection.release();

    // Return the fetched data
    return rows;
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error; // Rethrow the error for handling in the caller function
  }
}

async function updateCheck(id, updateTime) {
  for (const area in areaBosses) {
    if (areaBosses.hasOwnProperty(area)) {
      const bosses = areaBosses[area];
      const bossToUpdate = bosses.find((boss) => boss.Id === id);
      if (bossToUpdate) {
        bossToUpdate.lastCheck = updateTime;
        return true; // Return true if boss is found and chance is updated
      }
    }
  }
  return false; // Return false if boss with given Id is not found
}

async function updateAll(connection) {
  await scrapeSite();
  // Collect boss IDs that should be excluded from the update
  const updateCases = [];
  const bossStates = [];
  const bossIds = [];

  for (const [area, bosses] of Object.entries(areaBosses)) {
    for (const boss of bosses) {
      const boss_id = parseInt(boss.Id);
      const chance = boss.chance !== "" ? boss.chance : "NULL";
      const state =
        killedBosses.find((killedBoss) => killedBoss.bossName === boss.bossName)
          ?.state || 0;

      bossStates.push(`WHEN id = ${boss_id} THEN ${state}`);
      updateCases.push(`WHEN id = ${boss_id} THEN ${chance}`);
      bossIds.push(boss_id);
      const bossToUpdate = Object.values(areaBosses)
        .flat()
        .find((b) => parseInt(b.Id) === boss_id);
      if (bossToUpdate) {
        bossToUpdate.State = state;
      }
    }
  }

  if (updateCases.length > 0) {
    const updateQuery = `
    UPDATE Bosses
    SET 
      State = CASE 
        ${bossStates.join(" ")}           
        ELSE State
      END,
      Chance = CASE 
        ${updateCases.join(" ")}
        ELSE Chance
      END
    WHERE id IN (${bossIds.join(", ")});
  `;

    // Execute the single update query
    await connection.execute(updateQuery);
  }
  console.log(areaBosses);
  Object.values(areaBosses).forEach((bosses) => {
    bosses.sort(sortByChance);
  });
  Object.entries(areaBosses).forEach(async ([area, bosses]) => {
    const areaMessage = buttonMessages[area];
    if (areaMessage) {
      const actionRows = createActionRows(bosses);
      areaMessage.edit({ components: actionRows });
    }
  });
}

async function addKillBoss(bossName, newState, killtime, bossId, userId) {
  killedBosses.push({
    bossName: bossName,
    time: killtime,
    state: newState,
  });
  const connection = await pool.getConnection();
  await connection.execute(
    "INSERT INTO Boss_killed (boss, killed_time, state) VALUES (?, ?, ?);",
    [bossName, killtime, newState]
  );
  const logBossInput = bossId !== 0 ? bossId : bossName;
  const messageTime = new Date();
  await connection.execute(
    "INSERT INTO Logs (user, action, bossname, time) VALUES (?, ?, ?, ?);",
    [userId, newState, logBossInput, messageTime]
  );
  connection.release();
  return true; // Return true if boss is found and chance is updated
}

async function deleteKillBoss(bossName, bossId, userId) {
  const index = killedBosses.findIndex((row) => row.bossName === bossName);
  if (index !== -1) killedBosses.splice(index, 1);
  const connection = await pool.getConnection();
  await connection.execute(
    `DELETE FROM Boss_killed WHERE boss = '${bossName}' ;`
  );
  const logBossInput = bossId !== 0 ? bossId : bossName;
  const messageTime = new Date();
  await connection.execute(
    "INSERT INTO Logs (user, action, bossname, time) VALUES (?, ?, ?, ?);",
    [userId, 4, logBossInput, messageTime]
  );
  connection.release();
  return true; // Return true if boss is found and chance is updated
}

async function updateState(id, newState) {
  const connection = await pool.getConnection();
  const boss_id = parseInt(id);
  await connection.execute(
    `Update Bosses SET State = ${newState} WHERE id = ${boss_id};`
  );
  connection.release();
  return true; // Return true if boss is found and chance is updated
}

function buildKilledMessage() {
  let killedMessage = "Killed: \n";
  killedBosses.forEach((row) => {
    const bossName = row.bossName;
    const time = row.time;
    const inputTime = moment(time);
    const addedTime = inputTime.add(2, "hours");
    const hours = String(addedTime.hours()).padStart(2, "0");
    const minutes = String(addedTime.minutes()).padStart(2, "0");
    const state = row.state;
    let messageState = "✅";
    if (state == 2) {
      messageState = "😶‍🌫️";
    } else if (state == 3) {
      messageState = "🟥";
    }
    // Append information for each row to the message content
    killedMessage += `${messageState} ${bossName} ${hours}:${minutes}\n`;
  });
  return killedMessage;
}

function buildLogsMessage(logs) {
  if (logs.length == 0) {
    return "No logs";
  }
  let logsMessage = "";
  logs.forEach((row) => {
    const newTime = moment(row.time);
    const formattedTime = `${newTime.format("DD-MM-YYYY hh:mm")}`;

    let bossname = row.bossname;
    for (const area in areaBosses) {
      const bosses = areaBosses[area];
      const boss = bosses.find((boss) => boss.Id === row.bossname);
      if (boss) {
        bossname = boss.bossName;
      }
    }
    logsMessage += `${actionTypes[row.action]} - <@${
      row.user
    }> - ${bossname}, ${formattedTime}\n`;
  });
  return logsMessage;
}

const lastClickedTimes = new Map();

let intervalId;

let dailyMessage;

let logsChannelMessage;

let testMessage;

let buttonMessages = {};

client.once("ready", async () => {
  const currentDateTime = new Date();
  console.log("The bot is now connected and ready.", currentDateTime);
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);
  const localOffset = new Date().getTimezoneOffset() * 60 * 1000;
  try {
    // Fetch data using the fetchData function
    const areas = await fetchData("Areas");
    const bosses = await fetchData("Bosses");
    const message = await fetchData("Message");
    const killed = await fetchData("Boss_killed");
    killed.forEach((eachKilled) => {
      killedBosses.push({
        bossName: eachKilled.boss,
        time: eachKilled.killed_time,
        state: eachKilled.state,
      });
    });
    dailyMessage = message[process.env.KILLED_MESSAGE_ID - 1].message_id;
    const killedMessage = buildKilledMessage();
    if (dailyMessage == "") {
      const channel = await client.channels.fetch(
        process.env.DISCORD_MESSAGE_CHANNEL
      );
      const message = await channel.send(killedMessage);
      const connection = await pool.getConnection();
      await connection.execute(
        `UPDATE Message SET message_id = ${message.id} WHERE id = ${process.env.KILLED_MESSAGE_ID};`
      );
      connection.release();
    } else {
      const channel = await client.channels.fetch(
        process.env.DISCORD_MESSAGE_CHANNEL
      );
      const message = await channel.messages.fetch(dailyMessage);
      message.edit(killedMessage);
    }
    areas.forEach((area) => {
      let areabosses = [];
      bosses.forEach((boss) => {
        if (boss.Bossarea == area.Id) {
          var lastCheck = new Date(boss.Last_check);
          lastCheck.setTime(lastCheck.getTime() - localOffset);
          areabosses.push({
            Id: boss.Id.toString(),
            bossName: boss.Bossname,
            searchName: boss.Searchname,
            chance: boss.Chance ?? "",
            State: boss.State,
            lastCheck: lastCheck,
            stage: boss.Stage,
          });
        }
      });
      areaColors[area.Name] = area.Color;
      areaNames[area.Id] = area.Name;
      areaBosses[area.Name] = areabosses;
    });
    Object.values(areaBosses).forEach((bosses) => {
      bosses.sort(sortByChance);
    });
    if (process.env.DISCORD_LOGS_CHANNEL) {
      const logs = await fetchLogs();
      const logsMessage = buildLogsMessage(logs);
      const logsChannel = await client.channels.fetch(
        process.env.DISCORD_LOGS_CHANNEL
      );
      logsChannelMessage = await logsChannel.send(logsMessage);
    }

    createEntries(channel);
    let intervalMinute = new CronJob("* * * * *", async () => {
      Object.entries(areaBosses).forEach(async ([area, bosses]) => {
        const messages = await channel.messages.fetch({ limit: 20 });
        const areaMessage = messages.find((m) => {
          return m.embeds?.[0]?.title?.startsWith(`**${area} Bosses**`);
        });
        if (Date.now() - areaMessage.editedTimestamp > 60000) {
          if (
            areaMessage &&
            needsIndicatorUpdate(bosses, areaMessage.components)
          ) {
            const actionRows = createActionRows(bosses);
            areaMessage.edit({ components: actionRows });
          }
        }
      });
      if (process.env.DISCORD_LOGS_CHANNEL) {
        const logs = await fetchLogs();
        const newLogsMessage = buildLogsMessage(logs);
        const logsChannel = await client.channels.fetch(
          process.env.DISCORD_LOGS_CHANNEL
        );
        const logsMessage = await logsChannel.messages.fetch(
          logsChannelMessage
        );
        await logsMessage.edit(newLogsMessage);
      }
    });
    intervalMinute.start();
    let scheduledMessage = new CronJob("10 40 10 * * *", async () => {
      console.log("Daily schedule");
      await dailyScheduleFunctions("0000BOT0000");
    });

    scheduledMessage.start();
  } catch (error) {
    console.error("An error occurred:", error);
  }
});

function getIndicator(elapsed, boss) {
  const stageData = stages[boss.stage] || stages.default;

  for (let { min, max, indicator, buttonStyle } of stageData) {
    if (elapsed >= min && elapsed < max) {
      return { indicator, buttonStyle };
    }
  }
  return { indicator: "", buttonStyle: "Success" };
}

function createButton(boss) {
  const localTimeStamp = Date.now(); // Get the current time in milliseconds
  const elapsed = localTimeStamp - boss.lastCheck;
  const { indicator, buttonStyle } = getIndicator(elapsed, boss);

  const customChance =
    boss.chance === "0.00001"
      ? ""
      : boss.chance && boss.searchName
      ? `[${boss.chance}%]`
      : "";

  let label = boss.bossName;
  let style = buttonStyle;
  let disabled = false;
  let emoji = indicator || null;

  if (boss.searchName != null && boss.chance == "") {
    style = ButtonStyle.Secondary;
    emoji = null;
    disabled = true;
  } else if (boss.State == 1) {
    emoji = "☠️";
    style = ButtonStyle.Secondary;
    disabled = true;
  } else if (boss.State == 2) {
    emoji = "☁️";
    style = ButtonStyle.Secondary;
    disabled = true;
  } else if (boss.State == 3) {
    emoji = "☠️";
    style = ButtonStyle.Secondary;
    disabled = true;
  } else if (indicator == "") {
    emoji = null;
  }

  label += ` ${customChance}`.trim();

  const button = new ButtonBuilder()
    .setCustomId(boss.Id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (emoji) {
    button.setEmoji(emoji);
  }

  return button;
}

function createActionRows(bosses) {
  const actionRows = [];
  let actionRow = new ActionRowBuilder();
  bosses.forEach((boss, index) => {
    actionRow.addComponents(createButton(boss));
    if ((index + 1) % 4 === 0) {
      actionRows.push(actionRow);
      actionRow = new ActionRowBuilder();
    }
  });
  if (actionRow.components.length > 0) {
    actionRows.push(actionRow);
  }
  return actionRows;
}

async function createEntries(channel) {
  const messages = await channel.messages.fetch({ limit: 20 });
  let iterator = 0;
  Object.entries(areaBosses).forEach(([area, bosses]) => {
    messages.find((m) => {
      const found = m.embeds?.[0]?.title?.startsWith(`**${area} Bosses**`);
      if (found) {
        iterator++;
      }
    });
  });
  if (iterator != Object.keys(areaColors).length) {
    Object.entries(areaBosses).forEach(([area, bosses]) => {
      bosses.forEach((boss) => {
        lastClickedTimes.set(boss.bossName, new Date()); // Initialize last clicked times
      });
      const actionRows = createActionRows(bosses);
      let decimalColor = 0;
      if (areaColors[area]) {
        decimalColor = parseInt(areaColors[area].substring(2), 16);
      }
      const embed = new EmbedBuilder()
        .setColor(decimalColor)
        .setTitle(`**${area} Bosses**`);
      buttonMessages[area] = channel.send({
        embeds: [embed],
        components: actionRows,
      });
    });
  } else {
    Object.entries(areaBosses).forEach(async ([area, bosses]) => {
      const areaMessage = messages.find((m) => {
        return m.embeds?.[0]?.title?.startsWith(`**${area} Bosses**`);
      });
      buttonMessages[area] = areaMessage;
      if (areaMessage && needsIndicatorUpdate(bosses, areaMessage.components)) {
        const actionRows = createActionRows(bosses);
        areaMessage.edit({
          components: actionRows,
          editedTimestamp: Date.now(),
        });
      }
    });
  }
}

function needsIndicatorUpdate(bosses, currentComponents) {
  const newIndicators = bosses.map((boss) => {
    const { indicator } = getIndicator(Date.now() - boss.lastCheck, boss);
    return indicator;
  });

  for (let i = 0; i < currentComponents.length; i++) {
    const currentButtons = currentComponents[i].components;
    for (let j = 0; j < currentButtons.length; j++) {
      // Check if the button is disabled
      if (currentButtons[j].disabled) {
        continue; // Skip further checks for this button
      }
      const newIndicator = newIndicators[i * 4 + j]; // Adjust index based on rows
      if (!currentButtons[j].label.includes(newIndicator)) {
        return true; // Indicator needs update and button is not disabled
      }
    }
  }
  return false; // No indicator updates needed, or all buttons needing updates are disabled
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.deferred || interaction.replied) return;
  if (interaction.channelId !== process.env.DISCORD_CHANNEL) return;

  const bossId = interaction.customId;
  const clickTime = new Date(); // Get the current time in milliseconds
  await updateCheck(bossId, clickTime);
  const area = Object.keys(areaBosses).find((area) =>
    areaBosses[area].some((boss) => boss.Id === bossId)
  );

  if (area) {
    const actionRows = createActionRows(areaBosses[area]);
    await interaction.update({
      components: actionRows,
      editedTimestamp: Date.now(),
    });
  }
  const connection = await pool.getConnection();
  await connection.execute(
    "INSERT INTO Logs (user, action, bossname, time) VALUES (?, ?, ?, ?);",
    [interaction.user.id, 0, bossId, clickTime]
  );
  await connection.execute(
    `Update Bosses SET Last_check = CURRENT_TIMESTAMP WHERE id = ${bossId};`
  );
  connection.release();
});

async function scrapeSite() {
  const url = `https://guildstats.eu/bosses?world=Nevia&monsterName=&bossType=3&rook=0`;
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  // Find all <tr> elements
  $("tr").each((index, tr) => {
    // Find all <td> elements within the current <tr> element
    const tdElements = $(tr).find("td");
    Object.entries(areaBosses).forEach(([area, bosses]) => {
      bosses.forEach((boss) => {
        if (
          boss.searchName &&
          tdElements.length > 1 &&
          $(tdElements[1]).text().trim() === boss.searchName
        ) {
          const text = $(tdElements[10]).text().trim();
          if (text.includes("%")) {
            boss.chance = text.slice(0, -1);
          } else if (text.includes("Low")) {
            boss.chance = "0.00001";
          } else {
            boss.chance = "";
          }
        }
      });
    });
  });
  return;
}

const prefix = "!";

client.on("messageCreate", async (message) => {
  // Ignore messages from bots and messages that don't start with the prefix
  if (!message.content.startsWith(prefix) || message.author.bot) return;
  const member =
    message.member || (await message.guild.members.fetch(message.author.id));
  if (!member.roles.cache.has(process.env.ADMIN_ROLE)) {
    return;
  }
  // Split the message into command and arguments
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const bossName = args.slice(0, -1).join(" "); // Extract all but the last element as bossName
  const killtime = args[args.length - 1];
  const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL);

  if (message.channelId !== channel.id) {
    return;
  }
  if (command === "daily") {
    console.log("Daily message command");
    await dailyScheduleFunctions(message.author.id);
    const nonBossMessage = await message.reply("Daily info updated.");
    setTimeout(() => {
      nonBossMessage.delete(); // Delete after 5 seconds
      message.delete();
    }, 5000);
    return;
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  let subtractedTime;
  if (!timeRegex.test(killtime)) {
    const reply = await message.reply(
      `The time ${killtime} is not in a valid HH:MM format. Please provide a valid time.`
    );
    setTimeout(() => {
      message.delete();
      reply.delete();
    }, 5000);
    return;
  } else {
    const now = moment();
    const inputTime = moment(
      `${now.format("YYYY-MM-DD")} ${killtime}`,
      "YYYY-MM-DD HH:mm"
    );
    subtractedTime = inputTime.subtract(2, "hours");
    subtractedTime = subtractedTime.format("YYYY-MM-DD HH:mm:ss");
  }
  if (command === "kill" && bossName) {
    console.log("Kill message command");
    await updateBossState(
      bossName,
      1,
      message,
      channel,
      subtractedTime,
      message.author.id
    ); // Killed
    Object.values(areaBosses).forEach((bosses) => {
      bosses.sort(sortByChance);
    });
    return;
  } else if (command === "poof" && bossName) {
    console.log("Poof message command");
    await updateBossState(
      bossName,
      2,
      message,
      channel,
      subtractedTime,
      message.author.id
    ); // Poofed
    Object.values(areaBosses).forEach((bosses) => {
      bosses.sort(sortByChance);
    });
    return;
  } else if (command === "randomkill" && bossName) {
    console.log("Randomkill message command");
    await updateBossState(
      bossName,
      3,
      message,
      channel,
      subtractedTime,
      message.author.id
    ); // Poofed
    Object.values(areaBosses).forEach((bosses) => {
      bosses.sort(sortByChance);
    });
    return;
  } else if (command === "mistake" && bossName) {
    console.log("Mistake message command");
    await updateBossState(
      bossName,
      0,
      message,
      channel,
      subtractedTime,
      message.author.id
    ); // Reset to default
    Object.values(areaBosses).forEach((bosses) => {
      bosses.sort(sortByChance);
    });
    return;
  }
});

async function updateBossState(
  bossName,
  newState,
  message,
  channel,
  killtime,
  userId
) {
  let replyMessage = "Not listed boss was killed.";
  const area = Object.keys(areaBosses).find((area) =>
    areaBosses[area].some(
      (boss) => boss.bossName.toLowerCase() === bossName.toLowerCase()
    )
  );
  if (!area) {
    if (newState == 0) {
      deleteKillBoss(bossName, 0, userId);
      replyMessage = "Remove boss added by mistake!.";
    } else {
      addKillBoss(bossName, newState, killtime, 0, userId);
    }
    const nonBossMessage = await message.reply(replyMessage);
    setTimeout(() => {
      nonBossMessage.delete(); // Delete after 5 seconds
      message.delete();
    }, 5000);
    const killedMessage = buildKilledMessage();
    const channel_for_notify = await client.channels.fetch(
      process.env.DISCORD_MESSAGE_CHANNEL
    );
    const message_notify = await channel_for_notify.messages.fetch(
      dailyMessage
    );
    message_notify.edit(killedMessage);
    return;
  }
  areaBosses[area].map((boss) => {
    if (boss.bossName.toLowerCase() === bossName.toLowerCase()) {
      boss.State = newState;
      updateState(boss.Id, newState);
      if (newState == 0) {
        deleteKillBoss(bossName, boss.Id, userId);
      } else {
        addKillBoss(bossName, newState, killtime, boss.Id, userId);
      }
    }
    return boss;
  });
  Object.values(areaBosses).forEach((bosses) => {
    bosses.sort(sortByChance);
  });
  const updatedOrder = areaBosses[area].map((boss) => {
    return boss;
  });
  const actionRows = createActionRows(updatedOrder);
  const messages = await channel.messages.fetch({ limit: 20 });
  const areaMessage = messages.find((m) =>
    m.embeds[0]?.title.startsWith(`**${area} Bosses**`)
  );
  if (areaMessage) {
    await areaMessage.edit({ components: actionRows });
  }
  const confirmationMessage = await message.reply(
    `${bossName} status updated.`
  );
  setTimeout(() => {
    confirmationMessage.delete(); // Delete after 5 seconds
    message.delete();
  }, 5000);
  const killedMessage = buildKilledMessage();
  const channel_for_notify = await client.channels.fetch(
    process.env.DISCORD_MESSAGE_CHANNEL
  );
  const message_notify = await channel_for_notify.messages.fetch(dailyMessage);
  message_notify.edit(killedMessage);
}

async function dailyScheduleFunctions(userId) {
  const connection = await pool.getConnection();
  await connection.execute(
    "DELETE FROM Boss_killed WHERE killed_time < ADDDATE(DATE(NOW()), INTERVAL 2 HOUR);"
  );

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    2,
    0,
    0
  );
  killedBosses = killedBosses.filter(
    (killed) => new Date(killed.time) >= today
  );
  const killedMessage = buildKilledMessage();
  const message_channel = await client.channels.fetch(
    process.env.DISCORD_MESSAGE_CHANNEL
  );
  dailyMessage = await message_channel.send(killedMessage);

  await connection.execute(
    `UPDATE Message SET message_id = ${dailyMessage.id} WHERE id = ${process.env.KILLED_MESSAGE_ID};`
  );
  await connection.execute(
    "INSERT INTO Logs (user, action, bossname, time) VALUES (?, ?, ?, ?);",
    [userId, 5, "Daily message update", now]
  );
  await updateAll(connection);
  // This code will be executed at 12:00:00 PM every day
  connection.release();
}

client.login(process.env.DISCORD_TOKEN);
