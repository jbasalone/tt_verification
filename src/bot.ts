import { Client, GatewayIntentBits, Message, TextChannel, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
import {
    assignTimeTravelRole,
    registerTimeTravelRoleMap,
    isInVerificationChannel,
    deleteRoleMapping,
} from "./TimeTravelManager";
import { initDatabase, GuildConfig, RoleConfig, getPrefix, setPrefix } from "./database"; // Prefix support

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error("Missing DISCORD_BOT_TOKEN in .env file");

const EPIC_RPG_BOT_ID = "555955826880413696";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once("ready", async () => {
    await initDatabase();
    console.log(`Bot is online as ${client.user?.tag}`);
});

client.on("messageCreate", async (message: Message) => {
    try {
        if (!message.guild) return; // Ignore non-guild messages

        const guildId = message.guild.id;
        const prefix = await getPrefix(guildId) || "ep"; // Default to 'ep' if no prefix is set
        const PREFIX_REGEX = new RegExp(`^${prefix}\\s+tt(\\s+|$)`, "i");

        // Handle Epic RPG bot embeds
        if (message.author.bot && message.author.id === EPIC_RPG_BOT_ID && message.embeds.length > 0) {
            const embed = message.embeds[0];

            const isVerifiedChannel = await isInVerificationChannel(guildId, message.channel.id);
            if (!isVerifiedChannel) return;

            const progressField = embed.fields.find((field) => field.name === "PROGRESS");
            if (!progressField) return;

            const timeTravelMatch = progressField.value.match(/\*\*Time travels\*\*: (\d+)/);
            if (!timeTravelMatch) return;

            const timeTravelCount = parseInt(timeTravelMatch[1], 10);
            console.log(`Extracted time travel count: ${timeTravelCount}`);

            // Fetch and filter messages
            const fetchedMessages = await message.channel.messages.fetch({ limit: 50 });
            const messagesArray = [...fetchedMessages.values()].filter((msg) => msg.inGuild());

            const previousMessage = messagesArray.find((msg) =>
                ["rpg p", "rpg profile"].includes(msg.content.toLowerCase())
            );

            if (!previousMessage) {
                await message.channel.send("Only the account owner can validate time travel levels.");
                return;
            }

            const usernameFromEmbed = embed.author?.name?.split(" — ")[0]?.toLowerCase();
            const previousAuthor = previousMessage.author.username.toLowerCase();

            if (usernameFromEmbed !== previousAuthor) {
                console.log(
                    `Profile mismatch: Embed profile "${usernameFromEmbed}" does not match the command author "${previousAuthor}".`
                );
                await message.channel.send("<:timetravel:1333943892751552607> Only the account owner can validate time travel levels.");
                return;
            }

            console.log(`Processing time travel roles for ${previousMessage.author.tag} (profile: "${usernameFromEmbed}").`);
            await assignTimeTravelRole(previousMessage.member!, timeTravelCount, message.channel as TextChannel);
        }

        // Command Handling
        const match = message.content.match(PREFIX_REGEX);
        if (!match) return;

        const args = message.content.slice(match[0].length).trim().split(/\s+/);
        const command = args.shift()?.toLowerCase();

        if (!command || command === "") {
            const helpEmbed = new EmbedBuilder()
                .setTitle("Time Travel Bot Commands")
                .setColor("Blue")
                .setDescription(`<:timetravel:1333943892751552607> Here are the available commands for the Time Travel Bot (Prefix: \`${prefix}\`)`)
                .addFields(
                    { name: "Set Role", value: `\`${prefix} tt setrole <min> <max> <role_id>\`\n\`${prefix} tt setrole <min>+ <role_id>\`` },
                    { name: "Set Verification Channel", value: `\`${prefix} tt setchannel\`` },
                    { name: "View Configuration", value: `\`${prefix} tt config\`` },
                    { name: "Delete Role Mapping", value: `\`${prefix} tt delrole <role_id>\`` },
                    { name: "Set Prefix", value: `\`${prefix} tt setprefix <new_prefix>\`` }
                )
                .setFooter({ text: "Use the commands to configure roles, channels, and prefixes for time travel tracking." });

            await message.reply({ embeds: [helpEmbed] });
            return;
        }

        if (command === "setprefix" && message.guild) {
            if (!message.member?.permissions.has("ManageGuild")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            const newPrefix = args[0];
            if (!newPrefix) {
                await message.reply("Usage: `tt setprefix <new_prefix>`\nExample: `tt setprefix bs`");
                return;
            }

            await setPrefix(guildId, newPrefix);
            await message.reply(`Prefix successfully changed to \`${newPrefix}\`. Use \`${newPrefix} tt\` for commands.`);
        } else if (command === "setrole" && message.guild) {
            if (!message.member?.permissions.has("ManageRoles")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            const rangeArg = args[0];
            const roleId = args[1];

            if (!rangeArg || !roleId) {
                await message.reply(`Usage: \`${prefix} tt setrole <min> <max> <role_id>\` or \`${prefix} tt setrole <min>+ <role_id>\``);
                return;
            }

            const min = parseInt(rangeArg.replace("+", ""), 10);
            const isOpenEnded = rangeArg.endsWith("+");
            const max = isOpenEnded ? null : parseInt(args[2], 10);

            if (isNaN(min) || (!isOpenEnded && (max === null || isNaN(max)))) {
                await message.reply(
                    `Usage: \`${prefix} tt setrole <min> <max> <role_id>\` or \`${prefix} tt setrole <min>+ <role_id>\`\nExample: \`${prefix} tt setrole 25+ 123456789012345678\``
                );
                return;
            }

            const role = message.guild.roles.cache.get(roleId);
            if (!role) {
                await message.reply(`Role with ID \`${roleId}\` not found.`);
                return;
            }

            await registerTimeTravelRoleMap(message.guild.id, min, max, role.id);

            await message.reply(`Configured role with ID \`${role.id}\` for time travel range ${min}-${max ?? "infinity"}.`);
        } else if (command === "config" && message.guild) {
            if (!message.member?.permissions.has("ManageGuild")) {
                await message.reply("You don't have permission to use this command.");
                return;
            }

            const guildConfig = await GuildConfig.findOne({ where: { guildId: message.guild.id } });
            const roleConfigs = await RoleConfig.findAll({ where: { guildId: message.guild.id } });

            const embed = new EmbedBuilder()
                .setTitle("Server Configuration")
                .setColor("Blue")
                .addFields(
                    { name: "Verification Channel", value: guildConfig?.verificationChannelId ? `<#${guildConfig.verificationChannelId}>` : "Not Set" },
                    {
                        name: "Role Mappings",
                        value: roleConfigs.length > 0
                            ? roleConfigs.map((config) => `Role <@&${config.roleId}>: ${config.min} - ${config.max ?? "infinity"}`).join("\n")
                            : "No roles configured."
                    }
                );

            await message.reply({ embeds: [embed] });
        } else {
            await message.reply(`Unknown command. Use \`${prefix} tt\` to view available commands.`);
        }
    } catch (error) {
        console.error("Error handling messageCreate event:", error);
        await message.reply("An error occurred while processing your request.");
    }
});

client.login(TOKEN);