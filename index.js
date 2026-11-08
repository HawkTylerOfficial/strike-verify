const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const fs = require('fs');

// --- Express Server for 24/7 Runtime Hosting ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Blood Strike Registration Bot is running 24/7!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// --- Database Helper ---
const DB_FILE = './database.json';

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ registrations: {} }, null, 2));
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- Discord Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

// Configuration variables updated with your credentials
const TOKEN = 'MTU2OTA0MjY4NjA5MzE2ODY2MA.GieEhH.3VDuq_aeJqRJMDF3CToUOA8utjiQIQj_BtkodY';
const CLIENT_ID = '1569042686093168660';
const STAFF_CHANNEL_ID = '1569044168876232865';

// Register Slash Command
const commands = [
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your Blood Strike account')
        .addStringOption(option =>
            option.setName('ign')
                .setDescription('Your Blood Strike In-Game Name (Letters, numbers, symbols allowed)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('game_id')
                .setDescription('Your Blood Strike ID (Must be exactly 12 digits)')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Upload a screenshot or proof image')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    // --- Handle Slash Commands ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'register') {
            const db = loadDatabase();
            const userId = interaction.user.id;

            // Check if user already registered
            if (db.registrations[userId]) {
                return interaction.reply({ 
                    content: '❌ لقد قمت بعملية التسجيل مسبقاً ولا يمكنك التسجيل مرة أخرى.', 
                    ephemeral: true 
                });
            }

            const ign = interaction.options.getString('ign');
            const gameId = interaction.options.getString('game_id');
            const image = interaction.options.getAttachment('image');

            // Validate Blood Strike ID: strictly numbers and exactly 12 digits
            const idRegex = /^\d{12}$/;
            if (!idRegex.test(gameId)) {
                return interaction.reply({ 
                    content: '❌ أيدي لعبة بلود سترايك يجب أن يتكون من **12 رقماً فقط** وبدون أي أحرف أو مسافات.', 
                    ephemeral: true 
                });
            }

            // Save temporary pending status
            db.registrations[userId] = {
                ign,
                gameId,
                imageUrl: image.url,
                status: 'pending'
            };
            saveDatabase(db);

            // Send confirmation DM to user
            try {
                await interaction.user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📝 تم استلام طلب تسجيلك')
                            .setDescription('تم إرسال طلب تسجيلك في لعبة بلود سترايك بنجاح وهو الآن قيد المراجعة من قبل المشرفين.')
                            .addFields(
                                { name: 'اسم اللاعب', value: ign, inline: true },
                                { name: 'الايدي', value: gameId, inline: true }
                            )
                            .setColor(0xF1C40F)
                            .setTimestamp()
                    ]
                });
            } catch (err) {
                console.log(`Could not send DM to user ${userId}`);
            }

            // Send to staff review channel
            const staffChannel = await client.channels.fetch(STAFF_CHANNEL_ID).catch(() => null);
            if (staffChannel) {
                const staffEmbed = new EmbedBuilder()
                    .setTitle('🔍 طلب تسجيل جديد في Blood Strike')
                    .addFields(
                        { name: 'صاحب الحساب', value: `<@${userId}> (${userId})`, inline: false },
                        { name: 'اسم اللاعب (IGN)', value: ign, inline: true },
                        { name: 'الايدي (ID)', value: gameId, inline: true }
                    )
                    .setImage(image.url)
                    .setColor(0x3498DB)
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_${userId}`)
                        .setLabel('قبول (Accept)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_${userId}`)
                        .setLabel('رفض (Reject)')
                        .setStyle(ButtonStyle.Danger)
                );

                await staffChannel.send({ embeds: [staffEmbed], components: [row] });
            }

            return interaction.reply({ 
                content: '✅ تم إرسال طلب تسجيلك بنجاح! تحقق من رسائلك الخاصة لمتابعة الحالة.', 
                ephemeral: true 
            });
        }
    }

    // --- Handle Button Interactions (Staff Actions) ---
    if (interaction.isButton()) {
        const [action, targetUserId] = interaction.customId.split('_');

        // Check if user is staff (Administrator permission check)
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذه الأزرار.', ephemeral: true });
        }

        const db = loadDatabase();

        if (action === 'accept') {
            if (db.registrations[targetUserId]) {
                db.registrations[targetUserId].status = 'accepted';
                saveDatabase(db);
            }

            // Notify user via DM
            try {
                const targetUser = await client.users.fetch(targetUserId);
                await targetUser.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🎉 تهانينا! تم قبول تسجيلك')
                            .setDescription('لقد تم قبول طلب تسجيلك في لعبة بلود سترايك بنجاح من قبل الإدارة.')
                            .setColor(0x2ECC71)
                            .setTimestamp()
                    ]
                });
            } catch (err) {
                console.log('Failed to send acceptance DM.');
            }

            // Disable buttons and update staff message
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('accepted_disabled')
                    .setLabel('تم القبول ✅')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true)
            );

            await interaction.update({ components: [disabledRow] });
            await interaction.followUp({ content: `✅ تم قبول طلب العضو بنجاح بواسطة ${interaction.user.tag}`, ephemeral: true });
        } 
        
        else if (action === 'reject') {
            // Show Modal for Rejection Reason
            const modal = new ModalBuilder()
                .setCustomId(`reject_modal_${targetUserId}`)
                .setTitle('سبب رفض التسجيل');

            const reasonInput = new TextInputBuilder()
                .setCustomId('reject_reason')
                .setLabel('اكتب سبب الرفض هنا:')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            await interaction.showModal(modal);
        }
    }

    // --- Handle Rejection Modal Submission ---
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('reject_modal_')) {
            const targetUserId = interaction.customId.split('_')[2];
            const reason = interaction.fields.getTextInputValue('reject_reason');

            const db = loadDatabase();
            if (db.registrations[targetUserId]) {
                // Remove from registered database so they can re-register if needed, or keep status as rejected
                delete db.registrations[targetUserId];
                saveDatabase(db);
            }

            // Notify user via DM with reason
            try {
                const targetUser = await client.users.fetch(targetUserId);
                await targetUser.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ عذراً، تم رفض تسجيلك')
                            .setDescription('للأسف تم رفض طلب تسجيلك في لعبة بلود سترايك.')
                            .addFields({ name: 'السبب (Reason)', value: reason })
                            .setColor(0xE74C3C)
                            .setTimestamp()
                    ]
                });
            } catch (err) {
                console.log('Failed to send rejection DM.');
            }

            // Update original staff message
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('rejected_disabled')
                    .setLabel('تم الرفض ❌')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

            await interaction.update({ 
                content: `❌ **تم رفض الطلب بواسطة:** ${interaction.user.tag}\n**السبب:** ${reason}`, 
                components: [disabledRow] 
            });
        }
    }
});

client.login(TOKEN);
