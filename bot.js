const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const areaBosses = {
    "MWC": ["Furyosa", "Robbers (Checked Board)"],
    "Free Account Areas": [
        "Foreman", "Grorlam", "The Evil Eye", "Xenia", "Zarabustor", "Zevelon",
        "Warlord Ruzad", "Rukor Zad", "Dharalion", "Frog Prince",
        "General Murius", "Yaga"
    ],
    "PoI": [
        "Countess", "Hand", "Imp", "Punish", "Massacre",
        "Plasmother", "Dracola"
    ],
    "Edron, Darama & Port Hope": [
        "Arachir", "Gravelord", "Tzumruh", "Captain Jones", "Shlorg",
        "Big Bad One", "Valor", "Trollvier", "Smuggler", "Cobrasss",
        "Oodok & Arthom", "Welter", "Hairman", "Old Whopper"
    ],
    "Svar, Liberty Bay & others": [
        "Diblis", "Tyrn (LB)", "Grandfather", "Man In The Cave", "Ocyakao",
        "Hirintor (Nibelor)", "Hirintor (Mines)", "Barbaria", "Zushuka",
        "Omrafir"
    ],
    "Zao": [
        "Flea (NW Cave)", "Flea (SW Cave)", "Flea (Surface)", "Hatebreeder",
        "Flamecaller (Temple)", "Flamecaller (Mountain)", "Battlemaster Zunzu",
        "Dreadmaw(s)", "Voice(s)", "All Zao"
    ],
    "Rotworms": [
        "Rot Queen (Edron)", "Rot Queen (Hellgate)", "Rot Queen (LB)", "Rot Queen (Dara)",
        "White Pale (Edron)", "White Pale (LB)", "White Pale (Dara)"
    ]
};

const areaColors = {
    "MWC": 0xFFD700,
    "Free Account Areas": 0xFFC0CB,
    "PoI": 0xFF0000,
    "Edron, Darama & Port Hope": 0x008000,
    "Svar, Liberty Bay & others": 0x800080,
    "Zao": 0xFFA500,
    "Rotworms": 0x00FFFF
};

const lastClickedTimes = new Map();

client.once('ready', async () => {
    console.log('The bot is now connected and ready.');
    const channel = await client.channels.fetch('1227654141753688064');
    
    Object.entries(areaBosses).forEach(([area, bosses]) => {
        bosses.forEach(boss => {
            lastClickedTimes.set(boss, new Date()); // Initialize last clicked times
        });
        const actionRows = createActionRows(bosses);
        const embed = new EmbedBuilder()
            .setColor(areaColors[area])
            .setTitle(`**${area} Bosses**`);
        channel.send({ embeds: [embed], components: actionRows });
    });

    // Periodically update all boss messages
    setInterval(async () => {
        Object.entries(areaBosses).forEach(async ([area, bosses]) => {
            const actionRows = createActionRows(bosses);
            const messages = await channel.messages.fetch({ limit: 100 });
            const areaMessage = messages.find(m => m.embeds && m.embeds[0].title.startsWith(`**${area} Bosses**`));
            if (areaMessage) {
                areaMessage.edit({ components: actionRows });
            }
        });
    }, 60000); // Update every minute
});

function getIndicator(elapsed, bossName) {
    if (areaBosses["PoI"].includes(bossName)) {
        if (elapsed >= 5400000 && elapsed < 10800000) return '❕';
        if (elapsed >= 10800000 && elapsed < 14400000) return '❗';
        if (elapsed >= 14400000) return '⏰';
    } else {
        if (elapsed >= 1200000 && elapsed < 2400000) return '❕'; // 20 mins to <40 mins
        if (elapsed >= 2400000 && elapsed < 3600000) return '❗'; // 40 mins to <1 hour
        if (elapsed >= 3600000) return '⏰'; // 1 hour+
    }
    return '';
}

function createButton(bossName) {
    const elapsed = (Date.now() - lastClickedTimes.get(bossName).getTime());
    const indicator = getIndicator(elapsed, bossName);
    return new ButtonBuilder()
        .setCustomId(bossName.replace(/\s+/g, '_'))
        .setLabel(`${bossName} ${indicator}`)
        .setStyle(ButtonStyle.Success);
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

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.deferred || interaction.replied) return;

    const bossName = interaction.customId.replace(/_/g, ' ');
    const now = new Date();
    lastClickedTimes.set(bossName, now);

    const area = Object.keys(areaBosses).find(area => areaBosses[area].includes(bossName));
    const actionRows = createActionRows(areaBosses[area]);
    await interaction.update({ components: actionRows });
});

client.login(process.env.DISCORD_TOKEN);



