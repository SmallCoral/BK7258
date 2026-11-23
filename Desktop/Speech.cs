using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Text;
using System.Web.Script.Serialization;

internal static class Speech
{
    private static int Main(string[] args)
    {
        Console.InputEncoding = new UTF8Encoding(false);
        Console.OutputEncoding = new UTF8Encoding(false);
        var json = new JavaScriptSerializer();
        try
        {
            var request = json.Deserialize<Dictionary<string, object>>(Console.In.ReadToEnd());
            if (args[0] == "speak")
            {
                using (var voice = new SpeechSynthesizer())
                {
                    voice.SelectVoiceByHints(VoiceGender.NotSet, VoiceAge.NotSet, 0,
                                              CultureInfo.GetCultureInfo("zh-CN"));
                    voice.Volume = 65;
                    voice.Speak((string)request["text"]);
                }
                return 0;
            }
            var recognizer = SpeechRecognitionEngine.InstalledRecognizers()
                .FirstOrDefault(info => info.Culture.Name == "zh-CN");
            if (recognizer == null)
                throw new InvalidOperationException("Windows 未安装普通话语音识别。");

            using (var engine = new SpeechRecognitionEngine(recognizer))
            {
                var phrases = ((System.Collections.IEnumerable)request["phrases"]).Cast<string>().ToArray();
                var builder = new GrammarBuilder { Culture = recognizer.Culture };
                builder.Append(new Choices(phrases));
                engine.LoadGrammar(new Grammar(builder));
                if (args[0] == "listen")
                    engine.SetInputToDefaultAudioDevice();
                else
                    engine.SetInputToWaveFile((string)request["path"]);
                engine.EndSilenceTimeout = TimeSpan.FromMilliseconds(650);
                engine.EndSilenceTimeoutAmbiguous = TimeSpan.FromMilliseconds(850);
                var hit = engine.Recognize(TimeSpan.FromSeconds(6));
                Console.WriteLine(json.Serialize(new {
                    text = hit == null ? "" : hit.Text,
                    confidence = hit == null ? 0 : hit.Confidence
                }));
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.WriteLine(json.Serialize(new { error = error.GetBaseException().Message }));
            return 1;
        }
    }
}
