const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const { TOKEN, PREFIX, COLOR } = require("./config");
require("./keep_alive");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

let data = require("./data.json");

// Helper function to save data
function saveData() {
    fs.writeFileSync("./data.json", JSON.stringify(data, null, 2));
}

// Voice tier calculation
function getVCTier(minutes) {
    if (minutes >= 500) return 5;
    if (minutes >= 300) return 4;
    if (minutes >= 150) return 3;
    if (minutes >= 60) return 2;
    return 1;
}

// On ready
client.once("ready", () => {
    console.log(`${client.user.tag} is online!`);

    // Streaming presence with purple icon
    client.user.setPresence({
        activities: [{
            name: "",
            type: 1,
            url: "https://twitch.tv/yourchannel"
        }],
        status: "online"
    });

    // Auto leaderboard update every 5 mins
    setInterval(updateLeaderboards, 5 * 60 * 1000);
});

// Message Create
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    const member = message.member;

    // ----------------------
    // Points / Casino
    // ----------------------
    if (!data.points[member.id]) data.points[member.id] = 0;
    if (!data.vc[member.id]) data.vc[member.id] = 0;
    if (!data.chat[member.id]) data.chat[member.id] = 0;

    data.chat[member.id] += 1; // increment chat count

    // Balance
    if (["bal","balance"].includes(cmd)) {
        const balEmbed = new EmbedBuilder()
            .setTitle("Your Balance")
            .setColor(COLOR)
            .setDescription(`**${member} • ${data.points[member.id]} points**`);
        return message.channel.send({embeds:[balEmbed]});
    }

    // Daily
    if (["daily","dj"].includes(cmd)) {
        const amount = 100;
        data.points[member.id] += amount;
        saveData();
        const dailyEmbed = new EmbedBuilder()
            .setTitle("Daily Reward")
            .setColor(COLOR)
            .setDescription(`**${member} claimed ${amount} points!**`);
        return message.channel.send({embeds:[dailyEmbed]});
    }

    // Give points
    if (cmd === "give") {
        const target = message.mentions.members.first();
        const amount = parseInt(args[1]);
        if(!target || isNaN(amount) || amount <= 0) return message.reply("Invalid usage.");
        if(!data.points[target.id]) data.points[target.id] = 0;
        if(data.points[member.id] < amount) return message.reply("Not enough points.");
        data.points[member.id] -= amount;
        data.points[target.id] += amount;
        saveData();
        const giveEmbed = new EmbedBuilder()
            .setTitle("Points Transferred")
            .setColor(COLOR)
            .setDescription(`**${member} gave ${amount} points to ${target}.**`);
        return message.channel.send({embeds:[giveEmbed]});
    }

    // Rob (with protection)
    if (cmd === "rob") {
        const target = message.mentions.members.first();
        if(!target) return message.reply("Mention someone to rob.");
        if(data.protection[target.id]) return message.reply("Target is protected!");
        const success = Math.random() < 0.5;
        let amount = Math.floor(Math.random()*50)+10;
        if(success) {
            if(!data.points[target.id]) data.points[target.id] = 0;
            data.points[target.id] = Math.max(0,data.points[target.id]-amount);
            data.points[member.id] += amount;
            saveData();
            const robEmbed = new EmbedBuilder()
                .setTitle("Rob Success")
                .setColor(COLOR)
                .setDescription(`**${member} successfully robbed ${amount} points from ${target}!**`);
            return message.channel.send({embeds:[robEmbed]});
        } else {
            const robFailEmbed = new EmbedBuilder()
                .setTitle("Rob Failed")
                .setColor(COLOR)
                .setDescription(`**${member} tried to rob ${target} but failed!**`);
            return message.channel.send({embeds:[robFailEmbed]});
        }
    }

    // Protect self
    if (cmd === "protect") {
        data.protection[member.id] = true;
        saveData();
        const protectEmbed = new EmbedBuilder()
            .setTitle("Protection Activated")
            .setColor(COLOR)
            .setDescription(`**${member} is now protected from robbing.**`);
        return message.channel.send({embeds:[protectEmbed]});
    }

    // Disable / Enable rob
    if(cmd === "disable" && args[0]==="rob") {
        data.cooldowns.robDisabled = true;
        saveData();
        return message.reply("Rob has been disabled.");
    }
    if(cmd === "enable" && args[0]==="rob") {
        data.cooldowns.robDisabled = false;
        saveData();
        return message.reply("Rob has been enabled.");
    }

    // ----------------------
    // Moderation
    // ----------------------
    if(cmd === "clear") {
        if(!member.permissions.has("ManageMessages")) return message.reply("No perms.");
        const amt = parseInt(args[0]);
        if(!amt) return message.reply("Specify amount.");
        await message.channel.bulkDelete(amt,true);
        const clearEmbed = new EmbedBuilder()
            .setTitle("Messages Cleared")
            .setColor(COLOR)
            .setDescription(`**${member} deleted ${amt} messages in ${message.channel}.**`);
        return message.channel.send({embeds:[clearEmbed]});
    }

    if(cmd === "lock") {
        if(!member.permissions.has("ManageChannels")) return message.reply("No perms.");
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:false});
        const lockEmbed = new EmbedBuilder()
            .setTitle("Channel Locked")
            .setColor(COLOR)
            .setDescription(`**${message.channel} has been locked by ${member}.**`);
        return message.channel.send({embeds:[lockEmbed]});
    }

    if(cmd === "unlock") {
        if(!member.permissions.has("ManageChannels")) return message.reply("No perms.");
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:true});
        const unlockEmbed = new EmbedBuilder()
            .setTitle("Channel Unlocked")
            .setColor(COLOR)
            .setDescription(`**${message.channel} has been unlocked by ${member}.**`);
        return message.channel.send({embeds:[unlockEmbed]});
    }

    if(cmd === "snipe") {
        if(!client.snipes[message.channel.id]) return message.reply("Nothing to snipe.");
        const sniped = client.snipes[message.channel.id];
        const snipeEmbed = new EmbedBuilder()
            .setTitle("Last Deleted Message")
            .setColor(COLOR)
            .setDescription(`**Author:** ${sniped.author}\n**Message:** ${sniped.content}`);
        return message.channel.send({embeds:[snipeEmbed]});
    }

    // ----------------------
    // Roles
    // ----------------------
    if(["role","r"].includes(cmd)) {
        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.find(r => r.name === args.slice(1).join(" "));
        if(!target || !role) return message.reply("Invalid usage.");
        if([data.roles.mod,data.roles.admin,data.roles.owner].includes(role.id)) return message.reply("Cannot assign staff role.");
        await target.roles.add(role);
        const addRoleEmbed = new EmbedBuilder()
            .setTitle("Role Added")
            .setColor(COLOR)
            .setDescription(`**${member} added ${role} to ${target}.**`);
        return message.channel.send({embeds:[addRoleEmbed]});
    }

    if(["remrole","rr"].includes(cmd)) {
        const target = message.mentions.members.first();
        const role = message.guild.roles.cache.find(r => r.name === args.slice(1).join(" "));
        if(!target || !role) return message.reply("Invalid usage.");
        if([data.roles.mod,data.roles.admin,data.roles.owner].includes(role.id)) return message.reply("Cannot remove staff role.");
        await target.roles.remove(role);
        const remRoleEmbed = new EmbedBuilder()
            .setTitle("Role Removed")
            .setColor(COLOR)
            .setDescription(`**${member} removed ${role} from ${target}.**`);
        return message.channel.send({embeds:[remRoleEmbed]});
    }

    if(cmd === "roles") {
        const target = message.mentions.members.first() || member;
        const rolesEmbed = new EmbedBuilder()
            .setTitle(`${target.user.username}'s Roles`)
            .setColor(COLOR)
            .setDescription(target.roles.cache.map(r=>r.name).join(" • "));
        return message.channel.send({embeds:[rolesEmbed]});
    }

    if(cmd === "user") {
        const target = message.mentions.members.first() || member;
        const statsEmbed = new EmbedBuilder()
            .setTitle(`${target.user.username} Info`)
            .setColor(COLOR)
            .setDescription(`
**ID:** ${target.id}
**Joined Server:** ${new Date(target.joinedTimestamp).toLocaleDateString()}
**Roles:** ${target.roles.cache.map(r=>r.name).join(" • ")}
**VC Minutes:** ${Math.floor(data.vc[target.id]||0)}
**Messages Sent:** ${data.chat[target.id]||0}
`);
        return message.channel.send({embeds:[statsEmbed]});
    }

    // ----------------------
    // Help with buttons
    // ----------------------
    if(cmd === "help") {
        const helpEmbed = new EmbedBuilder()
            .setTitle("Help Menu")
            .setColor(COLOR)
            .setDescription("Click the buttons below to see command categories.");

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("cat_points")
                    .setLabel("Points / Casino")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId("cat_mod")
                    .setLabel("Moderation")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId("cat_roles")
                    .setLabel("Roles / User")
                    .setStyle(ButtonStyle.Secondary)
            );

        return message.channel.send({embeds:[helpEmbed], components:[row]});
    }
});

// Button interactions for .help
client.on("interactionCreate", async interaction => {
    if(!interaction.isButton()) return;
    let replyEmbed = new EmbedBuilder().setColor(COLOR);

    if(interaction.customId === "cat_points") {
        replyEmbed.setTitle("Points / Casino Commands")
            .setDescription(`
**.bal / .balance** → Check points
**.give @user <amt>** → Give points
**.daily / .dj** → Daily reward
**.gamble / .gam <amt>** → Gamble points
**.cf <amt> <heads/tails>** → Coinflip
**.sl / .slots <amt>** → Slots
**.bj <amt>** → Blackjack
**.dice <amt>** → Roll dice
**.roulette <amt> <color>** → Roulette
**.crash <amt>** → Crash game
**.mines <amt> <bombs>** → Mines
**.jackpot** → Claim jackpot
**.rob @user** → Rob points
**.protect** → Self-protect
**.disable rob / .enable rob** → Toggle rob
        `);
    } else if(interaction.customId === "cat_mod") {
        replyEmbed.setTitle("Moderation Commands")
            .setDescription(`
**.clear <amt>** → Delete messages
**.lock / .unlock** → Lock/Unlock channel
**.snipe** → Last deleted message
**.set modrole / adminrole / ownerrole** → Staff roles
        `);
    } else if(interaction.customId === "cat_roles") {
        replyEmbed.setTitle("Roles / User Commands")
            .setDescription(`
**.role / .r @user <role>** → Add role
**.remrole / .rr @user <role>** → Remove role
**.roles @user** → Show roles
**.user @user** → Show user info and stats
        `);
    }

    await interaction.reply({embeds:[replyEmbed], ephemeral:true});
});

// ----------------------
// Voice leaderboard auto-update
// ----------------------
function updateLeaderboards() {
    // Implement automatic leaderboard embeds for VC / Chat
    // send to predefined channels in data.json
}

// ----------------------
// Snipe deleted messages
// ----------------------
client.snipes = {};
client.on("messageDelete", message => {
    if(message.author.bot) return;
    client.snipes[message.channel.id] = {
        content: message.content,
        author: message.author.tag
    };
});

client.login(TOKEN);
