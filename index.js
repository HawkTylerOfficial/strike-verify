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

// Configuration variables using Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const STAFF_CHANNEL_ID = process.env.STAFF_CHANNEL_ID;

// Register Slash Commands (/register and /reset)
const commands = [
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('Register your Blood Strike account')
        .addStringOption(option =>
            option.setName('name_in_bloodstrike')
                .setDescription('Name in BloodStrike (Letters, numbers, symbols allowed)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('your_id_in_bloodstrike')
                .setDescription('Your ID in BloodStrike (Must be exactly 12 digits)')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('image_proof_1')
                .setDescription('Image Proof 1 (Required)')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('image_proof_2')
                .setDescription('Image Proof 2 (Required)')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('image_proof_3')
                .setDescription('Image Proof 3 (Required)')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('reset')
        .setDescription('Reset a user registration so they can register again (Staff Only)')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to reset registration for')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
        
        // --- /register Command ---
        if (interaction.commandName === 'register') {
            const db = loadDatabase();
            const userId = interaction.user.id;

            // Check if user already registered
            if (db.registrations[userId]) {
                return interaction.reply({ 
                    content: '**لقد قمت بعملية التسجيل مسبقاً ولا يمكنك التسجيل مرة أخرى. :x:**\n**You have already completed the registration process and cannot register again. :x:**', 
                    ephemeral: true 
                });
            }

            const ign = interaction.options.getString('name_in_bloodstrike');
            const gameId = interaction.options.getString('your_id_in_bloodstrike');
            const img1 = interaction.options.getAttachment('image_proof_1');
            const img2 = interaction.options.getAttachment('image_proof_2');
            const img3 = interaction.options.getAttachment('image_proof_3');

            // Validate Blood Strike ID: strictly numbers and exactly 12 digits
            const idRegex = /^\d{12}$/;
            if (!idRegex.test(gameId)) {
                return interaction.reply({ 
                    content: '❌ أيدي لعبة بلود سترايك يجب أن يتكون من **12 رقماً فقط** وبدون أي أحرف أو مسافات.\nBlood Strike ID must be exactly 12 digits.', 
                    ephemeral: true 
                });
            }

            // Save temporary pending status with 3 images
            db.registrations[userId] = {
                ign,
                gameId,
                imageUrl1: img1.url,
                imageUrl2: img2.url,
                imageUrl3: img3.url,
                status: 'pending'
            };
            saveDatabase(db);

            // Send confirmation DM to user
            try {
                await interaction.user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📝 تم استلام طلب تسجيلك / Registration Received')
                            .setDescription('تم إرسال طلب تسجيلك في مسابقة بلود سترايك بنجاح وهو الآن قيد المراجعة من قبل المشرفين.')
                            .addFields(
                                { name: 'اسم اللاعب / Name', value: ign, inline: true },
                                { name: 'الايدي / ID', value: gameId, inline: true }
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
                    .setTitle('🔍 طلب تسجيل جديد في مسابقة 500 جولد للعبة BloodStrike\nNew registration request for the 500 Gold giveaway in the game BloodStrike')
                    .addFields(
                        { name: 'التسجيل من طرف / Registered by', value: `<@${userId}> (${userId})`, inline: false },
                        { name: 'اسم لاعب في لعبة بلود سترايك & A player name in the game Blood Strike', value: ign, inline: false },
                        { name: 'الأيدي في لعبة بلود سترايك & BloodStrike In Game ID', value: gameId, inline: false },
                        { name: 'صور الإثبات / Proof Images', value: `[صورة 1](${img1.url}) | [صورة 2](${img2.url}) | [صورة 3](${img3.url})`, inline: false }
                    )
                    .setImage(img1.url)
                    .setColor(0x3498DB)
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`accept_${userId}`)
                        .setLabel('قبول / Acceptance')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`reject_${userId}`)
                        .setLabel('مرفوض / Unacceptable')
                        .setStyle(ButtonStyle.Danger)
                );

                await staffChannel.send({ embeds: [staffEmbed], components: [row] });
            }

            return interaction.reply({ 
                content: '✅ تم إرسال طلب تسجيلك بنجاح! تحقق من رسائلك الخاصة لمتابعة الحالة.\nYour registration request has been sent successfully!', 
                ephemeral: true 
            });
        }

        // --- /reset Command (Staff Only) ---
        if (interaction.commandName === 'reset') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذا الأمر.\nYou do not have permission to use this command.', ephemeral: true });
            }

            const targetUser = interaction.options.getUser('target');
            const db = loadDatabase();

            if (db.registrations[targetUser.id]) {
                delete db.registrations[targetUser.id];
                saveDatabase(db);
                return interaction.reply({ 
                    content: `✅ تم إعادة ضبط بيانات التسجيل للمستخدم <@${targetUser.id}> بنجاح، ويمكنه التسجيل مرة أخرى.\nSuccessfully reset registration data for <@${targetUser.id}>.`, 
                    ephemeral: true 
                });
            } else {
                return interaction.reply({ 
                    content: `❌ هذا المستخدم غير مسجل مسبقاً في قاعدة البيانات.\nThis user is not registered in the database.`, 
                    ephemeral: true 
                });
            }
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
                            .setTitle('🎉 تهانينا! تم قبول تسجيلك / Registration Accepted')
                            .setDescription('لقد تم قبول طلب تسجيلك في مسابقة بلود سترايك بنجاح من قبل الإدارة.')
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
                    .setLabel('تم القبول / Accepted ✅')
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
                .setTitle('سبب رفض التسجيل / Rejection Reason');

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
                delete db.registrations[targetUserId];
                saveDatabase(db);
            }

            // Notify user via DM with reason
            try {
                const targetUser = await client.users.fetch(targetUserId);
                await targetUser.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ عذراً، تم رفض تسجيلك / Registration Rejected')
                            .setDescription('للأسف تم رفض طلب تسجيلك في مسابقة بلود سترايك.')
                            .addFields({ name: 'السبب / Reason', value: reason })
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
                    .setLabel('تم الرفض / Rejected ❌')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );

            await interaction.update({ 
                content: `❌ **تم رفض الطلب بواسطة:** ${interaction.user.tag}\n**السبب / Reason:** ${reason}`, 
                components: [disabledRow] 
            });
        }
    }
});

client.login(TOKEN);
